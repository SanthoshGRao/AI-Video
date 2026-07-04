"use client";

import { useMemo, useState } from "react";
import {
  History,
  GitCompare,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ScriptVersion } from "@/types";

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface ScriptHistoryPanelProps {
  projectId: string;
  scripts: ScriptVersion[];
  selectedScriptId: string | null;
  latestBatch: number | null;
  onSelect: (id: string) => void;
  onRefresh: () => Promise<void>;
  toast: (type: "success" | "error", title: string) => void;
}

export function ScriptHistoryPanel({
  scripts,
  selectedScriptId,
  latestBatch,
  onSelect,
}: ScriptHistoryPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareA, setCompareA] = useState<string>("");
  const [compareB, setCompareB] = useState<string>("");

  const batches = useMemo(() => {
    const map = new Map<number, ScriptVersion[]>();
    for (const s of scripts) {
      const list = map.get(s.generationBatch) ?? [];
      list.push(s);
      map.set(s.generationBatch, list);
    }
    return [...map.entries()]
      .sort(([a], [b]) => b - a)
      .map(([batch, items]) => ({
        batch,
        items: items.sort((a, b) => a.versionNumber - b.versionNumber),
        createdAt: items[0]?.createdAt,
      }));
  }, [scripts]);

  const activate = async (scriptId: string) => {
    onSelect(scriptId);
  };

  if (scripts.length === 0) return null;

  return (
    <>
      <Card className="shadow-sm border-slate-200">
        <CardContent className="p-0">
          <button
            type="button"
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
            onClick={() => setExpanded((e) => !e)}
          >
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-indigo-600" />
              <span className="text-sm font-semibold text-slate-900">
                Version history
              </span>
              <Badge variant="secondary" className="text-[10px]">
                {batches.length} generation{batches.length !== 1 ? "s" : ""} ·{" "}
                {scripts.length} versions
              </Badge>
            </div>
            {expanded ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {expanded && (
            <div className="border-t border-slate-100 px-5 py-4 space-y-4 max-h-[360px] overflow-y-auto">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (scripts.length >= 2) {
                    setCompareA(scripts[0].id);
                    setCompareB(scripts[1].id);
                  }
                  setCompareOpen(true);
                }}
                disabled={scripts.length < 2}
              >
                <GitCompare className="w-3.5 h-3.5" />
                Compare versions
              </Button>

              {batches.map(({ batch, items, createdAt }) => (
                <div key={batch} className="space-y-2">
                  <div className="flex items-center gap-2 sticky top-0 bg-white py-1">
                    <span className="text-xs font-bold text-slate-700">
                      Generation {batch}
                      {batch === latestBatch && (
                        <Badge variant="default" className="ml-2 text-[9px]">
                          Latest
                        </Badge>
                      )}
                    </span>
                    {createdAt && (
                      <span className="text-[10px] text-slate-400">
                        {formatWhen(createdAt)}
                      </span>
                    )}
                  </div>
                  <ul className="space-y-2">
                    {items.map((script) => {
                      const isSelected = selectedScriptId === script.id;
                      return (
                        <li
                          key={script.id}
                          className={cn(
                            "rounded-xl border p-3 text-sm transition-colors",
                            isSelected
                              ? "border-indigo-300 bg-indigo-50/50"
                              : "border-slate-100 bg-slate-50/50"
                          )}
                        >
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className="font-medium text-slate-900">
                              v{script.versionNumber} · {script.variationStyle}
                            </span>
                            {script.isActive && (
                              <Badge variant="default" className="text-[9px]">
                                Active
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 line-clamp-2 mb-2">
                            {script.content}
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            disabled={isSelected}
                            onClick={() => void activate(script.id)}
                          >
                            {isSelected ? "In use" : "Use this version"}
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Compare script versions</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 shrink-0">
            <select
              className="text-sm border rounded-lg px-2 py-2"
              value={compareA}
              onChange={(e) => setCompareA(e.target.value)}
            >
              {scripts.map((s) => (
                <option key={s.id} value={s.id}>
                  Batch {s.generationBatch} · v{s.versionNumber} ·{" "}
                  {s.variationStyle}
                </option>
              ))}
            </select>
            <select
              className="text-sm border rounded-lg px-2 py-2"
              value={compareB}
              onChange={(e) => setCompareB(e.target.value)}
            >
              {scripts.map((s) => (
                <option key={s.id} value={s.id}>
                  Batch {s.generationBatch} · v{s.versionNumber} ·{" "}
                  {s.variationStyle}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4 flex-1 min-h-0 mt-2">
            {[compareA, compareB].map((id, i) => {
              const s = scripts.find((x) => x.id === id);
              return (
                <div
                  key={i}
                  className="flex flex-col min-h-0 rounded-xl bg-slate-50 border overflow-hidden"
                >
                  <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-white shrink-0">
                    <span className="text-xs font-medium text-slate-600 truncate">
                      {s
                        ? `v${s.versionNumber} · ${s.variationStyle}`
                        : "—"}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 text-xs shrink-0"
                      disabled={!s || selectedScriptId === s.id}
                      onClick={() => {
                        if (s) {
                          void activate(s.id);
                          setCompareOpen(false);
                        }
                      }}
                    >
                      Use this version
                    </Button>
                  </div>
                  <div className="p-4 overflow-y-auto flex-1 text-sm whitespace-pre-wrap leading-relaxed max-h-[50vh]">
                    {s?.content ?? "—"}
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
