import type { ExtractedFactsResult } from "@/lib/ai/extract-facts";

export const FACTS_ENVELOPE_VERSION = 1 as const;

export type FactsFieldStatus = "pending" | "approved" | "rejected";

export type FactFieldFlag = {
  invented: boolean;
  reason?: string;
};

export type ValidatedFactsEnvelope = {
  version: typeof FACTS_ENVELOPE_VERSION;
  data: ExtractedFactsResult;
  fieldStatus: Record<string, FactsFieldStatus>;
  flags: Record<string, FactFieldFlag>;
  /** Set when user confirms facts for script generation */
  approvedAt: string | null;
};

export type FactsFieldKey = keyof ExtractedFactsResult;
