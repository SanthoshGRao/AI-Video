import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { getOrCreateDbUser } from "@/lib/auth/user";
import { unauthorized, handleRouteError } from "@/lib/api/errors";
import { trackEvent } from "@/lib/analytics/track";

export async function POST(request: Request) {
  try {
    const user = await getOrCreateDbUser();
    if (!user) throw unauthorized();

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const clientMediaId = formData.get("clientMediaId") as string | null;
    const thumbnail = formData.get("thumbnail") as File | null;
    const mediaFolderId = formData.get("mediaFolderId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const { processMediaUpload } = await import("@/lib/media/process-upload");
    const mediaAsset = await processMediaUpload({
      userId: user.id,
      file,
      preferredId: clientMediaId,
      thumbnailFile: thumbnail,
      mediaFolderId: mediaFolderId || undefined,
    });

    await trackEvent(user.id, "global_media_uploaded", {
      mediaId: mediaAsset.id,
    });

    return NextResponse.json({ mediaAsset }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
