"use client";

import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { Settings, Key, Database, Bell, Share2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SocialConnectionsPanel } from "@/components/social/social-connections-panel";

export default function SettingsPage() {
  const { user } = useUser();

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[var(--text-primary)]">Settings</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-0.5">
          Account and workspace preferences
        </p>
      </div>

      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Settings className="w-5 h-5 text-indigo-600" />
            <div>
              <p className="text-sm font-semibold text-slate-900">Signed in as</p>
              <p className="text-sm text-slate-600">
                {user?.primaryEmailAddress?.emailAddress ?? "—"}
              </p>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Profile and password are managed through Clerk. Use the avatar menu in the top bar.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Share2 className="w-4 h-4 text-indigo-600" />
            Social media accounts
          </h2>
          <SocialConnectionsPanel />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Key className="w-4 h-4 text-indigo-600" />
            API keys (local .env)
          </h2>
          <ul className="text-sm text-slate-600 space-y-2 list-disc pl-5">
            <li>
              <code className="text-xs bg-slate-100 px-1 rounded">OPENAI_API_KEY</code> — AI scripts & facts
            </li>
            <li>
              <code className="text-xs bg-slate-100 px-1 rounded">GOOGLE_AI_API_KEY</code> — Cloud TTS (Gemini voices) + Speech-to-Text word sync
            </li>
            <li>
              <code className="text-xs bg-slate-100 px-1 rounded">DATABASE_URL</code> — Supabase Postgres
            </li>
          </ul>
          <p className="text-xs text-slate-500">
            Restart <code className="bg-slate-100 px-1 rounded">npm run dev</code> after changing keys.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Bell className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold">Activity notifications</p>
              <p className="text-xs text-slate-500 mt-1">
                Shown in the bell icon when you extract facts, generate scripts, or export.
              </p>
            </div>
          </div>
          <Button variant="secondary" size="sm" asChild>
            <Link href="/dashboard/analytics">View analytics</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Database className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold">Database</p>
              <p className="text-xs text-slate-500 mt-1">
                Run migrations and seed templates:{" "}
                <code className="bg-slate-100 px-1 rounded">npm run db:push && npm run db:seed</code>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
