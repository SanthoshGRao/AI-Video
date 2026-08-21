import prisma from "./src/lib/db/prisma";

async function main() {
  const jobs = await prisma.exportJob.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  console.log("RECENT EXPORT JOBS:");
  for (const job of jobs) {
    console.log(`Job ID: ${job.id}`);
    console.log(`Status: ${job.status}`);
    console.log(`Progress: ${job.renderProgress}%`);
    console.log(`Error: ${job.errorMessage}`);
    console.log(`Created At: ${job.createdAt}`);
    console.log("-----------------------------------------");
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
