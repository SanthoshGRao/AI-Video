import { factSchema, type ExtractedFactsResult } from "@/lib/ai/extract-facts";
import { FACT_FIELD_DEFINITIONS } from "@/lib/facts/fields";
import { computeAllFieldFlags } from "@/lib/facts/verify-source";
import {
  FACTS_ENVELOPE_VERSION,
  type FactsFieldStatus,
  type ValidatedFactsEnvelope,
} from "@/lib/facts/types";
import { isFieldPopulated } from "@/lib/facts/utils";

export { isFieldPopulated } from "@/lib/facts/utils";

export function getPopulatedFieldKeys(data: Record<string, unknown>): string[] {
  return FACT_FIELD_DEFINITIONS.map((f) => f.key).filter((key) =>
    isFieldPopulated(key, data[key])
  );
}

export function createEnvelopeFromExtracted(
  extracted: ExtractedFactsResult,
  rawText: string
): ValidatedFactsEnvelope {
  const fieldStatus: Record<string, FactsFieldStatus> = {};
  for (const key of getPopulatedFieldKeys(extracted)) {
    fieldStatus[key] = "pending";
  }

  return {
    version: FACTS_ENVELOPE_VERSION,
    data: extracted,
    fieldStatus,
    flags: computeAllFieldFlags(extracted, rawText),
    approvedAt: null,
  };
}

export function parseEnvelope(
  value: unknown
): ValidatedFactsEnvelope | null {
  if (!value || typeof value !== "object") return null;
  const v = value as ValidatedFactsEnvelope;
  if (v.version !== FACTS_ENVELOPE_VERSION || !v.data) return null;
  return v;
}

export function getValidationBlockers(
  envelope: ValidatedFactsEnvelope
): string[] {
  const blockers: string[] = [];

  for (const key of getPopulatedFieldKeys(envelope.data)) {
    const status = envelope.fieldStatus[key] ?? "pending";
    const flag = envelope.flags[key];

    if (status === "pending") {
      blockers.push(`${key}: needs review`);
    }
    if (flag?.invented && status !== "approved") {
      blockers.push(`${key}: suspected invented fact — approve or edit`);
    }
  }

  return blockers;
}

export function canConfirmFacts(envelope: ValidatedFactsEnvelope): boolean {
  return getValidationBlockers(envelope).length === 0;
}

export function canGenerateScripts(
  envelope: ValidatedFactsEnvelope | null,
  hasExtractedFacts?: boolean
): boolean {
  if (hasExtractedFacts) return true;
  if (envelope?.approvedAt) return true;
  return envelope ? getPopulatedFieldKeys(envelope.data).length > 0 : false;
}

export function getScriptFacts(project: {
  validatedFacts: unknown;
  extractedFacts: unknown;
}): ExtractedFactsResult | null {
  const envelope = parseEnvelope(project.validatedFacts);
  if (envelope?.approvedAt) {
    return factSchema.parse(envelope.data);
  }
  if (project.extractedFacts) {
    return factSchema.parse(project.extractedFacts);
  }
  return null;
}

export function clearFieldValue(key: string): unknown {
  switch (key) {
    case "water":
    case "legal":
    case "nearbyLandmarks":
    case "additionalFeatures":
    case "highlights":
      return [];
    case "plantation":
      return [];
    case "distances":
      return [];
    case "electricity":
      return null;
    default:
      return null;
  }
}

export function rejectField(
  envelope: ValidatedFactsEnvelope,
  key: string
): ValidatedFactsEnvelope {
  return {
    ...envelope,
    approvedAt: null,
    data: {
      ...envelope.data,
      [key]: clearFieldValue(key),
    } as ExtractedFactsResult,
    fieldStatus: { ...envelope.fieldStatus, [key]: "rejected" },
  };
}
