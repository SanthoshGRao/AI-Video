import type { SnapshotData } from "./types";

function rawTextFromPropertyData(data: unknown): string {
  if (data && typeof data === "object" && "rawText" in data) {
    const t = (data as { rawText?: unknown }).rawText;
    return typeof t === "string" ? t : "";
  }
  return "";
}

/** True if snapshot has meaningful differences vs live project */
export function snapshotDiffersFromProject(
  snapshot: SnapshotData,
  project: {
    propertyData: unknown;
    extractedFacts: unknown;
    title: string;
  }
): boolean {
  const snapRaw = rawTextFromPropertyData(snapshot.project.propertyData);
  const liveRaw = rawTextFromPropertyData(project.propertyData);

  if (snapRaw.trim() !== liveRaw.trim()) return true;

  const snapFacts = JSON.stringify(snapshot.project.extractedFacts ?? null);
  const liveFacts = JSON.stringify(project.extractedFacts ?? null);
  if (snapFacts !== liveFacts) return true;

  if (snapshot.project.title !== project.title) return true;

  return false;
}

export function formatSnapshotSummary(data: SnapshotData): string {
  const parts: string[] = [];
  if (data.activeTab) parts.push(`Tab: ${data.activeTab}`);
  if (data.studio.scriptCount) parts.push(`${data.studio.scriptCount} scripts`);
  if (data.studio.hasContentPack) parts.push("social pack");
  if (data.studio.isEditingDetails) parts.push("unsaved property edits");
  return parts.join(" · ") || "Project workspace";
}
