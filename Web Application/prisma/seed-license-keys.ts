import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import crypto from "crypto";

function generateKey(prefix: string): string {
  const bytes = crypto.randomBytes(4).toString("hex").toUpperCase();
  const part1 = bytes.slice(0, 4);
  const part2 = bytes.slice(4, 8);
  return `${prefix}-${part1}-${part2}-2026`;
}

async function main() {
  const { default: prisma } = await import("../src/lib/db/prisma");
  console.log("=== Assigning License Keys & Personal Workspaces ===");

  const users = await prisma.user.findMany();
  console.log(`Found ${users.length} user(s).`);

  for (const user of users) {
    let licenseKey = user.licenseKey;
    if (!licenseKey) {
      licenseKey = generateKey("VS");
      await prisma.user.update({
        where: { id: user.id },
        data: { licenseKey },
      });
      console.log(`Assigned License Key ${licenseKey} to user ${user.email}`);
    }

    // Ensure user has a personal workspace
    const existingMembership = await prisma.workspaceMember.findFirst({
      where: { userId: user.id },
    });

    if (!existingMembership) {
      const workspaceKey = generateKey("WS");
      const workspace = await prisma.workspace.create({
        data: {
          name: `${user.name || user.email.split("@")[0]}'s Workspace`,
          workspaceKey,
          ownerId: user.id,
          members: {
            create: {
              userId: user.id,
              role: "OWNER",
            },
          },
        },
      });
      console.log(`Created default workspace '${workspace.name}' (${workspace.workspaceKey}) for ${user.email}`);
    }
  }

  console.log("=== License Key & Workspace Seeding Complete ===");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Seeding error:", e);
  process.exit(1);
});
