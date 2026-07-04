"use client";

import { MapPin, IndianRupee, Ruler, Droplets, Trees, Route } from "lucide-react";

type Facts = Record<string, unknown>;

function asString(v: unknown) {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export function FactsGrid({ facts }: { facts: Facts }) {
  const chips = [
    { icon: MapPin, label: "Location", value: asString(facts.location) },
    { icon: Ruler, label: "Plot size", value: asString(facts.plotSize) },
    {
      icon: IndianRupee,
      label: "Price",
      value: [asString(facts.price), asString(facts.priceUnit)].filter(Boolean).join(" ") || null,
    },
    { icon: Route, label: "Road", value: asString(facts.roadAccess) },
    {
      icon: Droplets,
      label: "Water",
      value: Array.isArray(facts.water) ? (facts.water as string[]).join(", ") : null,
    },
    {
      icon: Trees,
      label: "Plantation",
      value: Array.isArray(facts.plantation)
        ? (facts.plantation as { type: string; count: number | null }[])
            .map((p) => `${p.count ?? "?"} ${p.type}`)
            .join(", ")
        : null,
    },
  ].filter((c) => c.value);

  const highlights = Array.isArray(facts.highlights)
    ? (facts.highlights as string[])
    : [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {chips.map((chip) => (
          <div
            key={chip.label}
            className="flex items-start gap-3 p-3 rounded-xl bg-white border border-[var(--border-subtle)]"
          >
            <chip.icon className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {chip.label}
              </p>
              <p className="text-sm font-medium text-slate-800">{chip.value}</p>
            </div>
          </div>
        ))}
      </div>
      {highlights.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 mb-2">Highlights</p>
          <ul className="space-y-1.5">
            {highlights.map((h) => (
              <li
                key={h}
                className="text-sm text-slate-700 pl-3 border-l-2 border-indigo-200"
              >
                {h}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
