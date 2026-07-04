import prisma from "@/lib/db/prisma";
import {
  getLatestBatch,
  scriptsInBatch,
  pickDefaultScriptId,
} from "./utils";

export { getLatestBatch, scriptsInBatch, pickDefaultScriptId };

const VARIATIONS = [
  { 
    style: "Premium + Clear facts | TTS-ready", 
    angle: "Focus on premium, high-value representation with clear, direct facts. Highlight top-notch features like plantation quality, water/electricity setup, and legal clarity. Keep it extremely TTS-ready, direct, and factual." 
  },
  { 
    style: "Weekend farmhouse + Low maintenance | TTS-ready", 
    angle: "Focus on low-maintenance farmland, ideal for a weekend getaway, calm farmhouse, or retirement option. Highlight ease of maintenance (like drip irrigation), tranquility, and suitability for small-size farmhouse plans. Keep it cozy and inviting." 
  },
  { 
    style: "Urgent + Fast moving deal | TTS-ready", 
    angle: "Focus on urgency, high-demand, and fast-moving nature of the deal. Emphasize ready setup, immediate availability, and the opportunity for serious buyers to close the deal quickly. Use an active, energetic tone." 
  },
] as const;

export { VARIATIONS };

export async function getNextScriptBatchMeta(projectId: string) {
  const [batchAgg, versionAgg] = await Promise.all([
    prisma.scriptVersion.aggregate({
      where: { projectId },
      _max: { generationBatch: true },
    }),
    prisma.scriptVersion.aggregate({
      where: { projectId },
      _max: { versionNumber: true },
    }),
  ]);

  const nextBatch = (batchAgg._max.generationBatch ?? 0) + 1;
  const startVersion = versionAgg._max.versionNumber ?? 0;

  return { nextBatch, startVersion };
}
