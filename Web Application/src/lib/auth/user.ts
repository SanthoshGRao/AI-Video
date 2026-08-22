import { auth, currentUser } from "@clerk/nextjs/server";
import { Prisma, type User } from "@/generated/prisma/client";
import prisma from "@/lib/db/prisma";
import crypto from "crypto";

const DESKTOP_MODE = !!process.env.DESKTOP_MODE;

function generateKey(prefix: string): string {
  const bytes = crypto.randomBytes(4).toString("hex").toUpperCase();
  const part1 = bytes.slice(0, 4);
  const part2 = bytes.slice(4, 8);
  return `${prefix}-${part1}-${part2}-2026`;
}

/**
 * Desktop mode identity comes from the Electron shell's own Google OAuth
 * flow (browser-redirect sign-in), not Clerk — the signed-in profile is
 * passed in as env vars when the Electron main process spawns this Next.js
 * server. See Desktop Application/src/oauth.ts + config.ts.
 */
function desktopGoogleProfile(): {
  googleId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
} | null {
  const googleId = process.env.DESKTOP_GOOGLE_ID;
  const email = process.env.DESKTOP_GOOGLE_EMAIL;
  if (!googleId || !email) return null;
  return {
    googleId,
    email,
    name: process.env.DESKTOP_GOOGLE_NAME || null,
    avatarUrl: process.env.DESKTOP_GOOGLE_PICTURE || null,
  };
}

export async function getAuthUserId(): Promise<string | null> {
  if (DESKTOP_MODE) return desktopGoogleProfile()?.googleId ?? "local-desktop-user";
  const { userId } = await auth();
  return userId;
}

export async function requireAuthUserId(): Promise<string> {
  const userId = await getAuthUserId();
  if (!userId) {
    throw new Error("Unauthorized");
  }
  return userId;
}

/** Sync Clerk (or, in desktop mode, Google / Local fallback) user to Postgres and return the DB user row. */
export async function getOrCreateDbUser(): Promise<User | null> {
  if (DESKTOP_MODE) {
    const licenseKey = process.env.DESKTOP_LICENSE_KEY?.trim();
    const rawEmail = (process.env.DESKTOP_USER_EMAIL || process.env.DESKTOP_GOOGLE_EMAIL)?.trim();
    const googleId = process.env.DESKTOP_GOOGLE_ID?.trim();
    const cleanEmail = rawEmail ? rawEmail.toLowerCase() : null;

    try {
      // 1. By License Key
      if (licenseKey) {
        const u = await prisma.user.findUnique({ where: { licenseKey } });
        if (u) return u;
      }

      // 2. By Google ID (real OAuth ID)
      if (googleId && !googleId.startsWith("user:")) {
        const u = await prisma.user.findUnique({ where: { googleId } });
        if (u) return u;
      }

      // 3. By Email (Unified Account Matching)
      const userEmail = cleanEmail || (googleId ? `${googleId}@google.user` : "desktop@local.app");
      const uByEmail = await prisma.user.findUnique({ where: { email: userEmail } });

      if (uByEmail) {
        // Link googleId, name, avatar to existing single account if available
        const updateData: any = {};
        if (googleId && !googleId.startsWith("user:") && !uByEmail.googleId) {
          updateData.googleId = googleId;
        }
        if (process.env.DESKTOP_GOOGLE_NAME || process.env.DESKTOP_USER_NAME) {
          updateData.name = process.env.DESKTOP_GOOGLE_NAME || process.env.DESKTOP_USER_NAME;
        }
        if (process.env.DESKTOP_GOOGLE_PICTURE) {
          updateData.avatarUrl = process.env.DESKTOP_GOOGLE_PICTURE;
        }

        if (Object.keys(updateData).length > 0) {
          return await prisma.user.update({
            where: { id: uByEmail.id },
            data: updateData,
          });
        }
        return uByEmail;
      }

      // 4. Create new single master user account safely
      const newLicenseKey = generateKey("VS");
      const newUser = await prisma.user.create({
        data: {
          email: userEmail,
          googleId: googleId && !googleId.startsWith("user:") ? googleId : null,
          name: process.env.DESKTOP_USER_NAME || process.env.DESKTOP_GOOGLE_NAME || userEmail.split("@")[0],
          avatarUrl: process.env.DESKTOP_GOOGLE_PICTURE || null,
          licenseKey: newLicenseKey,
        },
      });

      return newUser;
    } catch (err) {
      console.error("[getOrCreateDbUser] Error resolving user:", err);
      const fallback = await prisma.user.findFirst();
      if (fallback) return fallback;
      throw err;
    }
  }

  const clerkId = await getAuthUserId();
  if (!clerkId) return null;

  const existing = await prisma.user.findUnique({ where: { clerkId } });
  if (existing) return existing;

  const clerkUser = await currentUser();
  if (!clerkUser) return null;

  const email =
    clerkUser.primaryEmailAddress?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress;

  if (!email) return null;

  return prisma.user.upsert({
    where: { clerkId },
    update: {
      email,
      name: clerkUser.fullName ?? clerkUser.firstName ?? null,
      avatarUrl: clerkUser.imageUrl ?? null,
    },
    create: {
      clerkId,
      email,
      name: clerkUser.fullName ?? clerkUser.firstName ?? null,
      avatarUrl: clerkUser.imageUrl ?? null,
    },
  });
}

export async function requireDbUser(): Promise<User> {
  const user = await getOrCreateDbUser();
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user;
}
