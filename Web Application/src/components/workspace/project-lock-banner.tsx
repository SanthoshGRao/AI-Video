"use client";

import { useState } from "react";
import { Eye, Loader2, Radio } from "lucide-react";
import { toast } from "sonner";
import { useProjectLock } from "@/hooks/use-project-lock";

function sinceLabel(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins === 1) return "1 minute ago";
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.floor(mins / 60);
  return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
}

/**
 * Presence bar for a project someone else is editing.
 *
 * Renders nothing at all in the common case — a private project, or one nobody
 * else has open — so it costs a signed-in solo user precisely one lock request
 * and then disappears.
 */
export function ProjectLockBanner({ projectId }: { projectId: string }) {
  const { lock, isReadOnly, takeOver } = useProjectLock(projectId);
  const [taking, setTaking] = useState(false);

  if (!isReadOnly || !lock.heldBy) return null;

  const who = lock.heldBy.userName || "A teammate";

  const handleTakeOver = async () => {
    setTaking(true);
    const next = await takeOver();
    setTaking(false);
    if (next?.isMine) {
      toast.success("You now have the edit lock");
    } else {
      toast.error("Could not take over — try again in a moment");
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 mb-4 rounded-xl border border-amber-300/60 bg-amber-50 dark:border-amber-700/50 dark:bg-amber-950/30">
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-70" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
      </span>

      <div className="flex-1 min-w-[200px]">
        <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
          {who} is editing this project
        </p>
        <p className="text-xs text-amber-700/80 dark:text-amber-300/70 flex items-center gap-1.5">
          <Eye className="w-3 h-3" />
          You&rsquo;re in view-only mode · started {sinceLabel(lock.heldBy.acquiredAt)}
        </p>
      </div>

      <button
        type="button"
        onClick={handleTakeOver}
        disabled={taking}
        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60 transition-colors"
        title="Take the edit lock — their unsaved changes may be lost"
      >
        {taking ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Radio className="w-3.5 h-3.5" />
        )}
        Take over
      </button>
    </div>
  );
}
