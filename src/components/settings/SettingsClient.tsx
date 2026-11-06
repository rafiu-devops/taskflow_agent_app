"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, ExternalLink, LogOut, ShieldCheck } from "lucide-react";
import type { AgentUser } from "@/types/agent";
import { initials } from "@/lib/utils";
import { MobileMenuButton } from "@/components/layout/AppShell";

type SettingsClientProps = {
  user: AgentUser;
  aiConfigured: boolean;
  managementUrl: string;
};

export default function SettingsClient({ user, aiConfigured, managementUrl }: SettingsClientProps) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const granted = Object.values(user.permissions ?? {}).filter(Boolean).length;
  const total = Object.keys(user.permissions ?? {}).length;

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="min-h-screen px-4 pb-10 pt-4 sm:px-6 lg:px-8">
      <header className="mx-auto flex max-w-4xl items-center gap-2">
        <MobileMenuButton />
        <button type="button" onClick={() => router.back()} aria-label="Go back" className="grid h-11 w-11 place-items-center rounded-2xl text-slate-600 transition hover:bg-white"><ArrowLeft className="h-5 w-5" aria-hidden="true" /></button>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Account</p>
          <h1 className="text-lg font-semibold leading-6 text-navy">Settings</h1>
        </div>
      </header>

      <main className="mx-auto mt-6 grid max-w-4xl gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
        <section className="overflow-hidden rounded-[2rem] bg-white p-6 shadow-[0_24px_60px_rgba(7,20,38,0.08)]">
          <div className="flex items-center gap-4">
            <div className="grid h-16 w-16 place-items-center rounded-3xl bg-navy text-sm font-black text-cyan">{initials(user.name)}</div>
            <div className="min-w-0">
              <h2 className="truncate text-xl font-semibold text-navy">{user.name}</h2>
              <p className="mt-1 truncate text-sm text-muted">{user.email}</p>
              <span className="mt-2 inline-flex rounded-full bg-primary-soft px-3 py-1 text-[11px] font-bold capitalize text-primary">{user.role}</span>
            </div>
          </div>
          <dl className="mt-6 divide-y divide-line/70">
            <Detail label="Employee ID" value={user.employeeId ?? "Not linked (admin account)"} />
            <Detail label="Department ID" value={user.departmentId ?? "Not linked"} />
            <Detail label="Access grants" value={user.role === "admin" ? "All permissions (admin)" : `${granted} of ${total} permissions enabled`} />
          </dl>
          <a href={managementUrl} target="_blank" rel="noreferrer" className="mt-6 inline-flex items-center gap-2 text-xs font-bold text-primary hover:underline">Open management dashboard <ExternalLink className="h-4 w-4" aria-hidden="true" /></a>
        </section>

        <aside className="h-fit space-y-6">
          <div className="rounded-[2rem] bg-navy p-6 text-white">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-cyan"><ShieldCheck className="h-5 w-5" aria-hidden="true" /></div>
            <h2 className="mt-4 text-base font-semibold">Backend status</h2>
            <ul className="mt-4 space-y-3 text-xs leading-6 text-slate-300">
              <li><span className="font-semibold text-white">Management API:</span> connected if your workspace pages load.</li>
              <li><span className="font-semibold text-white">AI provider:</span> {aiConfigured ? "configured" : "not configured — set AI_API_KEY on the agent server"}.</li>
              <li><span className="font-semibold text-white">Permissions:</span> enforced server-side on every request.</li>
            </ul>
          </div>

          <div className="rounded-[2rem] border border-line bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-navy">Session</h2>
            <p className="mt-2 text-xs leading-6 text-muted">Signing out clears this agent session. Your management session is also ended by the management backend.</p>
            <button type="button" onClick={signOut} disabled={signingOut} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60">
              <LogOut className="h-4 w-4" aria-hidden="true" />
              {signingOut ? "Signing out..." : "Sign out"}
            </button>
          </div>
        </aside>
      </main>
      <p className="mx-auto mt-6 max-w-4xl text-center text-[11px] text-muted">TaskFlow AI · Secure workforce assistant · <Link href="/offline" className="underline">Offline help</Link></p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="text-sm font-semibold text-navy">{value}</dd>
    </div>
  );
}
