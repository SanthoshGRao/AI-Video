import fs from "fs";
import { generateText } from "ai";
import prisma from "@/lib/db/prisma";
import { defaultModel } from "@/lib/ai/client";
import { parseJsonFromText } from "@/lib/ai/parse-json";
import { badRequest } from "@/lib/api/errors";
import { readFileSafe } from "@/lib/storage/local";
import { analyzeImageBuffer } from "@/lib/media/analyze-image";
import { mediaAnalysisSchema } from "@/lib/media/tags-schema";
import { serializeMediaAsset } from "@/lib/storage/serialize";

function propertyHintFromProject(propertyData: unknown): string | undefined {
  const pd = propertyData as { rawText?: string } | null;
  const raw = pd?.rawText?.trim();
  if (!raw) return undefined;
  return raw.slice(0, 800);
}

async function analyzeVideoMetadata(
  fileName: string,
  propertyHint?: string
) {
  const { text } = await generateText({
    model: defaultModel,
    prompt: `You tag property marketing VIDEO clips for an automatic real-estate video editor.
${propertyHint ? `Property: ${propertyHint}\n` : ""}
Filename: ${fileName}

You have NOT seen the video frames — infer likely tags from the filename and property context only. Use conservative confidence (0.4–0.7). Include generic tags like property_video, b_roll.

Return JSON only:
{
  "tags": [{ "tag": "snake_case_tag", "confidence": 0.5 }],
  "sceneDescription": "short note"
}`,
  });

  return parseJsonFromText(text, mediaAnalysisSchema);
}

export async function analyzeMediaAsset(
  asset: {
    id: string;
    projectId: string;
    type: string;
    originalName: string;
    mimeType: string;
    localPath: string | null;
  },
  propertyData: unknown
): Promise<ReturnType<typeof serializeMediaAsset>> {
  const hint = propertyHintFromProject(propertyData);
  let analysis;

  if (asset.type === "VIDEO") {
    analysis = await analyzeVideoMetadata(asset.originalName, hint);
  } else {
    if (!asset.localPath || !fs.existsSync(asset.localPath)) {
      throw badRequest(`Cannot read image file for ${asset.originalName}`);
    }
    const buffer = readFileSafe(asset.localPath);
    analysis = await analyzeImageBuffer(buffer, asset.mimeType, {
      fileName: asset.originalName,
      propertyHint: hint,
    });
  }

  await prisma.mediaTag.deleteMany({
    where: { mediaAssetId: asset.id, source: "ai" },
  });

  if (analysis.tags.length > 0) {
    await prisma.mediaTag.createMany({
      data: analysis.tags.map((t) => ({
        mediaAssetId: asset.id,
        tag: t.tag,
        confidence: t.confidence,
        source: "ai",
      })),
    });
  }

  const updated = await prisma.mediaAsset.findUniqueOrThrow({
    where: { id: asset.id },
    include: { mediaTags: { orderBy: { confidence: "desc" } } },
  });

  return serializeMediaAsset(updated);
}
