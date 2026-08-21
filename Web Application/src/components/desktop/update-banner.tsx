"use client";

import { useEffect, useState } from "react";
import { Download, RefreshCw, Sparkles, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";


export function DesktopUpdateNavButton() {
  const [hasUpdater, setHasUpdater] = useState(false);
  const [state, setState] = useState<{
    status: "idle" | "checking" | "available" | "not-available" | "downloading" | "downloaded" | "error";
    version?: string;
    percent?: number;
    error?: string;
  }>({ status: "idle" });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updater = window.desktopAPI?.updater;
    if (!updater) return;

    setHasUpdater(true);

    // Get initial status
    updater.getState().then((s: any) => {
      if (s) setState(s);
    });

    // Subscribe to status changes
    const unsub = updater.onStatusChange((s: any) => {
      if (s) setState(s);
    });

    return () => {
      unsub();
    };
  }, []);

  if (!hasUpdater) return null;
  if (state.status === "idle" || state.status === "checking" || state.status === "not-available") {
    return null;
  }

  const handleDownload = () => {
    if (typeof window !== "undefined") {
      window.desktopAPI?.updater?.download();
    }
  };

  const handleRestart = () => {
    if (typeof window !== "undefined") {
      window.desktopAPI?.updater?.quitAndInstall();
    }
  };

  const handleCheck = () => {
    if (typeof window !== "undefined") {
      window.desktopAPI?.updater?.check();
    }
  };

  if (state.status === "available") {
    return (
      <Button
        size="sm"
        onClick={handleDownload}
        className="h-8 px-3 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all duration-200"
        title="Click to download and install update"
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-200 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
        </span>
        <Download className="w-3.5 h-3.5" />
        <span>Update Available {state.version ? `(v${state.version})` : ""}</span>
      </Button>
    );
  }

  if (state.status === "downloading") {
    return (
      <Button
        size="sm"
        disabled
        className="h-8 px-3 rounded-full bg-emerald-700/90 text-white text-xs font-semibold flex items-center gap-1.5 opacity-90 cursor-wait"
      >
        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
        <span>Downloading... ({state.percent || 0}%)</span>
      </Button>
    );
  }

  if (state.status === "downloaded") {
    return (
      <Button
        size="sm"
        onClick={handleRestart}
        className="h-8 px-3 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md animate-pulse"
        title="Click to restart and complete update"
      >
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span>Restart to Update</span>
      </Button>
    );
  }

  if (state.status === "error") {
    return (
      <Button
        size="sm"
        variant="ghost"
        onClick={handleCheck}
        className="h-8 px-3 rounded-full border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-xs font-medium flex items-center gap-1.5 hover:bg-red-50 dark:hover:bg-red-950/30"
        title={state.error || "Click to retry update check"}
      >
        <AlertCircle className="w-3.5 h-3.5 text-red-500" />
        <span>Update Failed (Retry)</span>
      </Button>
    );
  }

  return null;
}

/** Legacy export kept null so bottom card never shows */
export function DesktopUpdateBanner() {
  return null;
}
