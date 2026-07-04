/** Client-safe script versioning helpers (no Prisma) */

export type ScriptLike = {
  id: string;
  generationBatch: number;
  versionNumber: number;
  variationStyle: string;
  isActive: boolean;
  isApproved: boolean;
  createdAt: string | Date;
};

export function getLatestBatch(scripts: ScriptLike[]): number | null {
  if (!scripts.length) return null;
  return Math.max(...scripts.map((s) => s.generationBatch));
}

export function scriptsInBatch<T extends ScriptLike>(scripts: T[], batch: number): T[] {
  return scripts
    .filter((s) => s.generationBatch === batch)
    .sort((a, b) => a.versionNumber - b.versionNumber);
}

export function pickDefaultScriptId(scripts: ScriptLike[]): string | null {
  if (!scripts.length) return null;
  const active = scripts.find((s) => s.isActive);
  if (active) return active.id;
  const latest = getLatestBatch(scripts);
  if (latest == null) return scripts[0].id;
  const inBatch = scriptsInBatch(scripts, latest);
  const approved = inBatch.find((s) => s.isApproved);
  return approved?.id ?? inBatch[0]?.id ?? scripts[0].id;
}
