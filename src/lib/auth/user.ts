import { auth, currentUser } from "@clerk/nextjs/server";
import type { User } from "@/generated/prisma/client";
import prisma from "@/lib/db/prisma";

export async function getAuthUserId(): Promise<string | null> {
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

/** Sync Clerk user to Postgres and return the DB user row. */
export async function getOrCreateDbUser(): Promise<User | null> {
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
