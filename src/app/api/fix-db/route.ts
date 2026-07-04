import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

export async function GET() {
  try {
    const tracks = await prisma.subtitleTrack.findMany({
      where: { projectId: "cmqmz1t4q00001suq8hvgandf" }
    });
    
    for (const track of tracks) {
      if (track.language === "english") {
        await prisma.subtitleTrack.update({
          where: { id: track.id },
          data: { language: "kannada" }
        });
      }
    }
    
    return NextResponse.json({ success: true, tracks });
  } catch (err) {
    return NextResponse.json({ error: String(err) });
  }
}
