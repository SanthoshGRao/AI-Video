"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Link2, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SOCIAL_PLATFORMS, type SocialPlatformId } from "@/lib/social/platforms";
import { toast } from "sonner";

type ConnectedAccount = {
  id: string;
  platform: string;
  accountName: string | null;
};

export function SocialConnectionsPanel({ compact = false }: { compact?: boolean }) {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [accountNames, setAccountNames] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/integrations/social", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load connections");
      setAccounts(json.accounts ?? []);
    } catch (err) {
      console.error(err);
      setAccounts([]);
      toast.error("Couldn't load connected social accounts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const connectedFor = (platformId: SocialPlatformId) => {
    const meta = SOCIAL_PLATFORMS.find((p) => p.id === platformId);
    if (!meta) return null;
    return accounts.find((a) => a.platform === meta.dbPlatform) ?? null;
  };

  const connect = async (platformId: SocialPlatformId) => {
    setBusy(platformId);
    try {
      const res = await fetch("/api/integrations/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: platformId,
          accountName: accountNames[platformId]?.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Connect failed");
      toast.success(`${SOCIAL_PLATFORMS.find((p) => p.id === platformId)?.label} connected`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not connect account");
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async (platformId: SocialPlatformId) => {
    setBusy(platformId);
    try {
      const res = await fetch(`/api/integrations/social?platform=${platformId}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Disconnect failed");
      toast.success("Account disconnected");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not disconnect");
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500 py-6 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading connected accounts...
      </div>
    );
  }

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <div className="grid gap-3 sm:grid-cols-2">
        {SOCIAL_PLATFORMS.map((platform) => {
          const connected = connectedFor(platform.id);
          const isBusy = busy === platform.id;
          return (
            <Card key={platform.id} className="shadow-sm overflow-hidden">
              <CardContent className={`p-4 ${compact ? "space-y-2" : "space-y-3"}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: platform.color }}
                    />
                    <p className="text-sm font-semibold text-slate-900 truncate">{platform.label}</p>
                  </div>
                  {connected ? (
                    <span className="text-[10px] uppercase tracking-wide font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                      Connected
                    </span>
                  ) : null}
                </div>

                {connected ? (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-600 truncate">
                      {connected.accountName || "Linked account"}
                    </p>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="w-full"
                      disabled={isBusy}
                      onClick={() => void disconnect(platform.id)}
                    >
                      {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unlink className="w-3.5 h-3.5" />}
                      Disconnect
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Input
                      placeholder={`@${platform.label.toLowerCase()} handle (optional)`}
                      value={accountNames[platform.id] ?? ""}
                      onChange={(e) =>
                        setAccountNames((prev) => ({ ...prev, [platform.id]: e.target.value }))
                      }
                      className="h-8 text-xs"
                    />
                    <Button
                      type="button"
                      size="sm"
                      className="w-full"
                      disabled={isBusy}
                      onClick={() => void connect(platform.id)}
                    >
                      {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                      Connect {platform.label}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
