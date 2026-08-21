import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getOrCreateDbUser } from "@/lib/auth/user";
import {
  importFontSchema,
  hasFontExtension,
  deriveFamilyNameFromUrl,
  parseGoogleFontsUrl,
} from "@/lib/validations/fonts";

async function isFontUrlReachable(url: string): Promise<boolean> {
  try {
    const head = await fetch(url, { method: "HEAD" });
    if (head.ok) return true;
  } catch {
    // some CDNs reject HEAD — fall through to a ranged GET
  }
  try {
    const partial = await fetch(url, { headers: { Range: "bytes=0-0" } });
    return partial.ok || partial.status === 206;
  } catch {
    return false;
  }
}

async function isGoogleFontFamilyValid(family: string): Promise<boolean> {
  const encoded = encodeURIComponent(family).replace(/%20/g, "+");
  try {
    // Google's CSS2 endpoint returns 400 for an unknown family, 200 for a real one.
    const res = await fetch(`https://fonts.googleapis.com/css2?family=${encoded}&display=swap`);
    return res.ok;
  } catch {
    return false;
  }
}

export async function GET() {
  const user = await getOrCreateDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const fonts = await prisma.customFont.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ fonts });
}

export async function POST(request: Request) {
  const user = await getOrCreateDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = importFontSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid font URL" }, { status: 400 });
  }

  const { url } = parsed.data;

  const googleFamily = parseGoogleFontsUrl(url);
  if (googleFamily) {
    if (!(await isGoogleFontFamilyValid(googleFamily))) {
      return NextResponse.json(
        { error: "Couldn't find that font on Google Fonts" },
        { status: 400 },
      );
    }

    const family = parsed.data.family?.trim() || googleFamily;
    const font = await prisma.customFont.upsert({
      where: { userId_family: { userId: user.id, family } },
      update: { url, source: "google" },
      create: { userId: user.id, family, url, source: "google" },
    });

    return NextResponse.json({ font });
  }

  if (!hasFontExtension(url)) {
    return NextResponse.json(
      {
        error:
          "Paste a Google Fonts link (e.g. fonts.google.com/specimen/...) or a direct .woff2/.woff/.ttf/.otf font file URL",
      },
      { status: 400 },
    );
  }

  if (!(await isFontUrlReachable(url))) {
    return NextResponse.json(
      { error: "Couldn't reach that font URL" },
      { status: 400 },
    );
  }

  const family = parsed.data.family?.trim() || deriveFamilyNameFromUrl(url);

  const font = await prisma.customFont.upsert({
    where: { userId_family: { userId: user.id, family } },
    update: { url, source: "file" },
    create: { userId: user.id, family, url, source: "file" },
  });

  return NextResponse.json({ font });
}
