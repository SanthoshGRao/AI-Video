import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import bcrypt from "bcryptjs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { licenseKey, email, password } = body;

    // Mode 1: License Key login
    if (licenseKey?.trim()) {
      const key = licenseKey.trim().toUpperCase();
      const user = await prisma.user.findUnique({
        where: { licenseKey: key },
        include: {
          workspaceMemberships: {
            include: { workspace: true },
          },
        },
      });

      if (!user) {
        return NextResponse.json({ error: "Invalid License Key" }, { status: 401 });
      }

      return NextResponse.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          licenseKey: user.licenseKey,
        },
        workspaces: user.workspaceMemberships.map((m) => ({
          id: m.workspace.id,
          name: m.workspace.name,
          role: m.role,
          workspaceKey: m.workspace.workspaceKey,
        })),
      });
    }

    // Mode 2: Email + Password login
    if (email?.trim() && password) {
      const cleanEmail = email.trim().toLowerCase();
      const user = await prisma.user.findUnique({
        where: { email: cleanEmail },
        include: {
          workspaceMemberships: {
            include: { workspace: true },
          },
        },
      });

      if (!user || !user.passwordHash) {
        return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
      }

      const match = await bcrypt.compare(password, user.passwordHash);
      if (!match) {
        return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
      }

      return NextResponse.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          licenseKey: user.licenseKey,
        },
        workspaces: user.workspaceMemberships.map((m) => ({
          id: m.workspace.id,
          name: m.workspace.name,
          role: m.role,
          workspaceKey: m.workspace.workspaceKey,
        })),
      });
    }

    return NextResponse.json({ error: "Please provide a License Key or Email & Password" }, { status: 400 });
  } catch (error) {
    console.error("[POST /api/auth/login] Failed:", error);
    return NextResponse.json(
      { error: "Authentication failed", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
