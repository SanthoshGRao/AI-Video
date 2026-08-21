import type { FactsFieldKey } from "@/lib/facts/types";

export type FieldKind = "text" | "boolean" | "stringList" | "plantation" | "distances";

export type FieldDefinition = {
  key: FactsFieldKey;
  label: string;
  kind: FieldKind;
  placeholder?: string;
};

export const FACT_FIELD_DEFINITIONS: FieldDefinition[] = [
  { key: "location", label: "Location", kind: "text", placeholder: "Village, district, state" },
  { key: "propertyType", label: "Property type", kind: "text", placeholder: "Farmland, plantation, layout…" },
  { key: "plotSize", label: "Plot size", kind: "text", placeholder: "e.g. 2 acres" },
  { key: "price", label: "Price", kind: "text", placeholder: "e.g. 45" },
  { key: "priceUnit", label: "Price unit", kind: "text", placeholder: "lakhs, crores…" },
  { key: "roadAccess", label: "Road access", kind: "text" },
  { key: "irrigation", label: "Irrigation", kind: "text" },
  { key: "electricity", label: "Electricity", kind: "boolean" },
  { key: "water", label: "Water sources", kind: "stringList", placeholder: "borewell, canal (comma-separated)" },
  { key: "legal", label: "Legal / documents", kind: "stringList" },
  { key: "plantation", label: "Plantation", kind: "plantation" },
  { key: "distances", label: "Distances", kind: "distances" },
  { key: "nearbyLandmarks", label: "Nearby landmarks", kind: "stringList" },
  { key: "additionalFeatures", label: "Additional features", kind: "stringList" },
  { key: "highlights", label: "Highlights", kind: "stringList" },
];

export function labelForField(key: string): string {
  return FACT_FIELD_DEFINITIONS.find((f) => f.key === key)?.label ?? key;
}
