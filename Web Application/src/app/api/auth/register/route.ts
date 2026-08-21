import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import bcrypt from "bcryptjs";
import crypto from "crypto";

function generateKey(prefix: string): string {
  const bytes = crypto.randomBytes(4).toString("hex").toUpperCase();
  const part1 = bytes.slice(0, 4);
  const part2 = bytes.slice(4, 8);
  return `${prefix}-${part1}-${part2}-2026`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, name } = body;

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Check existing user
    const existing = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (existing) {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const licenseKey = generateKey("VS");
    const workspaceKey = generateKey("WS");

    const user = await prisma.user.create({
      data: {
        email: cleanEmail,
        name: name?.trim() || cleanEmail.split("@")[0],
        passwordHash,
        licenseKey,
      },
    });

    // Create default personal workspace
    const workspace = await prisma.workspace.create({
      data: {
        name: `${user.name}'s Workspace`,
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

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        licenseKey: user.licenseKey,
      },
      workspace: {
        id: workspace.id,
        name: workspace.name,
        workspaceKey: workspace.workspaceKey,
      },
    }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/auth/register] Failed:", error);
    return NextResponse.json(
      { error: "Failed to register account", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
