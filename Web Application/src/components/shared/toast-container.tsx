"use client";

import { useEffect } from "react";
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle } from "lucide-react";
import { useUIStore } from "@/stores/ui-store";
import { cn } from "@/lib/utils";

const icons = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const styles = {
  success: "bg-emerald-50 border-emerald-200 text-emerald-900",
  error: "bg-rose-50 border-rose-200 text-rose-900",
  warning: "bg-amber-50 border-amber-200 text-amber-900",
  info: "bg-indigo-50 border-indigo-200 text-indigo-900",
};

export function ToastContainer() {
  const { toasts, removeToast } = useUIStore();

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => {
        const Icon = icons[toast.type];
        return (
          <ToastItem
            key={toast.id}
            toast={toast}
            Icon={Icon}
            onClose={() => removeToast(toast.id)}
          />
        );
      })}
    </div>
  );
}

function ToastItem({
  toast,
  Icon,
  onClose,
}: {
  toast: { id: string; type: keyof typeof icons; title: string; description?: string; duration?: number };
  Icon: React.ComponentType<{ className?: string }>;
  onClose: () => void;
}) {
  useEffect(() => {
    let active = true;
    const ms = toast.duration ?? 4500;
    const t = setTimeout(() => {
      if (active) onClose();
    }, ms);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [toast.id, toast.duration, onClose]);

  return (
    <div
      className={cn(
        "flex gap-3 p-4 rounded-xl border shadow-lg animate-slideUp",
        styles[toast.type]
      )}
    >
      <Icon className="w-5 h-5 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{toast.title}</p>
        {toast.description && (
          <p className="text-xs mt-0.5 opacity-80">{toast.description}</p>
        )}
      </div>
      <button onClick={onClose} className="shrink-0 p-0.5 rounded hover:bg-black/5">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
