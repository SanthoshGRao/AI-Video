import type { ExtractedFactsResult } from "@/lib/ai/extract-facts";
import type { FactFieldFlag, FactsFieldKey } from "@/lib/facts/types";
import { isFieldPopulated } from "@/lib/facts/utils";

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function appearsInSource(needle: string, source: string): boolean {
  const n = normalize(needle);
  if (n.length < 2) return true;
  const hay = normalize(source);
  if (hay.includes(n)) return true;

  // Match significant tokens (e.g. "2 acres" → "2" + "acres")
  const tokens = n.split(" ").filter((t) => t.length >= 2);
  if (tokens.length === 0) return true;
  const matched = tokens.filter((t) => hay.includes(t)).length;
  return matched / tokens.length >= 0.6;
}

function flagInvented(reason: string): FactFieldFlag {
  return { invented: true, reason };
}

function flagOk(): FactFieldFlag {
  return { invented: false };
}

export function verifyFieldInSource(
  key: FactsFieldKey,
  value: unknown,
  rawText: string
): FactFieldFlag {
  if (!isFieldPopulated(key, value)) return flagOk();

  switch (key) {
    case "location":
    case "plotSize":
    case "price":
    case "priceUnit":
    case "roadAccess":
    case "irrigation":
    case "propertyType": {
      const s = String(value);
      return appearsInSource(s, rawText)
        ? flagOk()
        : flagInvented("This value does not appear in your property description.");
    }
    case "electricity": {
      if (value !== true) return flagOk();
      const hay = normalize(rawText);
      const hints = ["electric", "power", "bijli", "connection", "eb", "mcb"];
      return hints.some((h) => hay.includes(h))
        ? flagOk()
        : flagInvented("Electricity is marked yes but your text does not mention power/electricity.");
    }
    case "water":
    case "legal":
    case "nearbyLandmarks":
    case "additionalFeatures":
    case "highlights": {
      const items = value as string[];
      const missing = items.filter((item) => !appearsInSource(item, rawText));
      if (missing.length === 0) return flagOk();
      return flagInvented(
        `Not found in source: ${missing.slice(0, 2).join(", ")}${missing.length > 2 ? "…" : ""}`
      );
    }
    case "plantation": {
      const rows = value as { type: string; count: number | null }[];
      const missing = rows.filter((r) => !appearsInSource(r.type, rawText));
      if (missing.length === 0) return flagOk();
      return flagInvented(
        `Plantation type not in source: ${missing.map((m) => m.type).join(", ")}`
      );
    }
    case "distances": {
      const rows = value as { place: string; km: number | null }[];
      const missing = rows.filter((r) => !appearsInSource(r.place, rawText));
      if (missing.length === 0) return flagOk();
      return flagInvented(
        `Place not in source: ${missing.map((m) => m.place).join(", ")}`
      );
    }
    default:
      return flagOk();
  }
}

export function computeAllFieldFlags(
  data: ExtractedFactsResult,
  rawText: string
): Record<string, FactFieldFlag> {
  const flags: Record<string, FactFieldFlag> = {};
  for (const key of Object.keys(data) as FactsFieldKey[]) {
    flags[key] = verifyFieldInSource(key, data[key], rawText);
  }
  return flags;
}
