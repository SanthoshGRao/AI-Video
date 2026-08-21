import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

export async function GET() {
  try {
    const tracks = await prisma.subtitleTrack.findMany({
      where: { language: "english" }
    });

    for (const t of tracks) {
      await prisma.subtitleTrack.update({
        where: { id: t.id },
        data: { language: "kannada_english" }
      });
    }

    return NextResponse.json({ success: true, fixed: tracks.length });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message });
  }
}
