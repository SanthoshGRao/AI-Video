import sharp from "sharp";
import { generateAIVision } from "@/lib/ai/generate";
import { parseJsonFromText } from "@/lib/ai/parse-json";
import { mediaAnalysisSchema, type MediaAnalysisResult } from "@/lib/media/tags-schema";

const MAX_EDGE = 1024;

export async function analyzeImageBuffer(
  buffer: Buffer,
  mimeType: string,
  context?: { fileName?: string; propertyHint?: string }
): Promise<MediaAnalysisResult> {
  const resized = await sharp(buffer)
    .rotate()
    .resize(MAX_EDGE, MAX_EDGE, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();

  const hint = context?.propertyHint
    ? `Property context: ${context.propertyHint}\n`
    : "";
  const fileName = context?.fileName
    ? `Filename: ${context.fileName}\n`
    : "";

  const text = await generateAIVision({
    label: "ANALYZE_IMAGE",
    image: resized,
    mimeType,
    prompt: `${hint}${fileName}
You analyze real-estate marketing photos (farmland, plantations, villas, plots).

Identify visual elements useful for automatic video editing: scenes, objects, mood, camera angle, time of day, amenities.

Return JSON only:
{
  "tags": [
    { "tag": "coconut_trees", "confidence": 0.92 },
    { "tag": "aerial_view", "confidence": 0.85 }
  ],
  "sceneDescription": "One sentence describing the shot"
}

Use snake_case tags (letters, numbers, underscores). 5–12 tags. Be specific to what is visible. Do not invent features not in the image.`,
  });

  return parseJsonFromText(text, mediaAnalysisSchema);
}
