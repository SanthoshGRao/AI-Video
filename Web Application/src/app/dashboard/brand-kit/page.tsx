"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Palette, Save, Phone, MessageCircle, Globe } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { useUIStore } from "@/stores/ui-store";

type BrandKit = {
  id: string;
  companyName: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
  phoneNumber: string | null;
  whatsappNumber: string | null;
  ctaFooter: string | null;
  website: string | null;
  logoUrl: string | null;
};

export default function BrandKitPage() {
  const queryClient = useQueryClient();
  const addToast = useUIStore((s) => s.addToast);
  const [form, setForm] = useState<Partial<BrandKit>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["brand-kit"],
    queryFn: () =>
      fetch("/api/brand-kit").then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json() as Promise<{ brandKit: BrandKit }>;
      }),
  });

  useEffect(() => {
    if (data?.brandKit) setForm(data.brandKit);
  }, [data]);

  const save = useMutation({
    mutationFn: (payload: Partial<BrandKit>) =>
      fetch("/api/brand-kit", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then((r) => {
        if (!r.ok) throw new Error("Save failed");
        return r.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brand-kit"] });
      addToast({ type: "success", title: "Brand kit saved" });
    },
    onError: () => {
      addToast({ type: "error", title: "Could not save brand kit" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <Palette className="w-5 h-5 text-indigo-600" />
          Brand Kit
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Logo, colors, and contact details appear on exported videos and social posts.
        </p>
      </div>

      <Card className="shadow-sm overflow-hidden">
        <div
          className="h-3"
          style={{
            background: `linear-gradient(90deg, ${form.primaryColor ?? "#4F46E5"}, ${form.secondaryColor ?? "#6366F1"}, ${form.accentColor ?? "#F59E0B"})`,
          }}
        />
        <CardContent className="p-6 space-y-6">
          <div>
            <label className="text-sm font-medium text-slate-700 mb-1.5 block">
              Company name
            </label>
            <Input
              value={form.companyName ?? ""}
              onChange={(e) =>
                setForm((f) => ({ ...f, companyName: e.target.value }))
              }
              placeholder="Your agency name"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            {(
              [
                ["primaryColor", "Primary"],
                ["secondaryColor", "Secondary"],
                ["accentColor", "Accent"],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <label className="text-xs font-medium text-slate-500 mb-1.5 block">
                  {label}
                </label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={(form[key] as string) ?? "#4F46E5"}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, [key]: e.target.value }))
                    }
                    className="w-10 h-10 rounded-lg border cursor-pointer"
                  />
                  <Input
                    value={(form[key] as string) ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, [key]: e.target.value }))
                    }
                    className="font-mono text-xs"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1">
                <Phone className="w-3.5 h-3.5" /> Phone
              </label>
              <Input
                value={form.phoneNumber ?? ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, phoneNumber: e.target.value }))
                }
                placeholder="+91 98765 43210"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1">
                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
              </label>
              <Input
                value={form.whatsappNumber ?? ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, whatsappNumber: e.target.value }))
                }
                placeholder="+91 98765 43210"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1">
              <Globe className="w-3.5 h-3.5" /> Website
            </label>
            <Input
              value={form.website ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
              placeholder="https://youragency.com"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 mb-1.5 block">
              Video footer / CTA line
            </label>
            <Input
              value={form.ctaFooter ?? ""}
              onChange={(e) =>
                setForm((f) => ({ ...f, ctaFooter: e.target.value }))
              }
              placeholder="Call now for site visit — Limited plots"
            />
          </div>

          <Button
            onClick={() => save.mutate(form)}
            disabled={save.isPending}
            className="w-full sm:w-auto"
          >
            <Save className="w-4 h-4" />
            {save.isPending ? "Saving..." : "Save brand kit"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
