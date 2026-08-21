"use client";

import type { ExtractedFactsResult } from "@/lib/ai/extract-facts";
import { FACT_FIELD_DEFINITIONS } from "@/lib/facts/fields";
import { isFieldPopulated } from "@/lib/facts/utils";

function formatValue(key: string, value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    if (key === "plantation") {
      return (
        value as { type: string; count: number | null }[]
      )
        .map((p) => (p.count != null ? `${p.type} (${p.count})` : p.type))
        .join(", ");
    }
    if (key === "distances") {
      return (
        value as { place: string; km: number | null }[]
      )
        .map((d) => (d.km != null ? `${d.place} ${d.km}km` : d.place))
        .join(", ");
    }
    return (value as string[]).join(", ");
  }
  return String(value);
}

export function FactsValidationPanel({
  extractedFacts,
}: {
  projectId: string;
  extractedFacts: Record<string, unknown>;
  rawText?: string;
  onConfirmed?: () => void;
}) {
  const data = extractedFacts as ExtractedFactsResult;
  const populated = FACT_FIELD_DEFINITIONS.filter((def) =>
    isFieldPopulated(def.key, data[def.key])
  );

  if (populated.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        No facts extracted yet. Run Extract facts after adding property details.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <span className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
          {populated.length} fields
        </span>
        {data.location && (
          <span className="inline-flex items-center rounded-md bg-indigo-50 px-2.5 py-1 text-xs text-indigo-800">
            {data.location}
          </span>
        )}
        {data.plotSize && (
          <span className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
            {data.plotSize}
          </span>
        )}
        {(data.price || data.priceUnit) && (
          <span className="inline-flex items-center rounded-md bg-emerald-50 px-2.5 py-1 text-xs text-emerald-800">
            {[data.price, data.priceUnit].filter(Boolean).join(" ")}
          </span>
        )}
        {data.propertyType && (
          <span className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
            {data.propertyType}
          </span>
        )}
      </div>

      <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-2 text-xs">
        {populated.map((def) => (
          <div key={def.key} className="min-w-0">
            <dt className="text-slate-500 truncate">{def.label}</dt>
            <dd className="font-medium text-slate-900 truncate" title={formatValue(def.key, data[def.key])}>
              {formatValue(def.key, data[def.key])}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
