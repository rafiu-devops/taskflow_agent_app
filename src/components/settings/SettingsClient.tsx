"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isSoundOn, setSoundOn, unlockAudio, playSound } from "@/lib/sound";
import AppHeader from "@/components/layout/AppHeader";
import type { AgentUser } from "@/types/agent";

type SettingsClientProps = {
  user: AgentUser;
  aiConfigured?: boolean;
  managementUrl?: string;
};

export default function SettingsClient({ user }: SettingsClientProps) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [soundOn, setSoundOnState] = useState(() => isSoundOn());
  const [installPrompt, setInstallPrompt] = useState<null | { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }>(null);

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as unknown as { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> });
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

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
    <div className="min-h-screen bg-[var(--bg)]">
      <AppHeader variant="secondary" title="Settings" />
      <main className="mx-auto max-w-[560px] px-4 py-6">
        <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)]">
          <div className="min-h-14 px-4 flex items-center justify-between gap-3">
            <span className="text-[15px] text-[var(--ink)]">Name</span>
            <span className="text-sm text-[var(--ink-muted)]">{user.name}</span>
          </div>
          <div className="min-h-14 px-4 flex items-center justify-between gap-3">
            <span className="text-[15px] text-[var(--ink)]">Role</span>
            <span className="text-sm text-[var(--ink-muted)]">{user.role === "admin" ? "Admin" : "Employee"}</span>
          </div>
          <div className="min-h-14 px-4 flex items-center justify-between gap-3">
            <span className="text-[15px] text-[var(--ink)]">Employee ID</span>
            <span className="text-sm text-[var(--ink-muted)]">{user.employeeId ?? "Not linked"}</span>
          </div>
          <div className="min-h-14 px-4 flex items-center justify-between gap-3">
            <span className="text-[15px] text-[var(--ink)]">Department ID</span>
            <span className="text-sm text-[var(--ink-muted)]">{user.departmentId ?? "Not linked"}</span>
          </div>
        </section>

        <section className="mt-4 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)]">
          <div className="min-h-14 px-4 flex items-center justify-between gap-3">
            <span className="text-[15px] text-[var(--ink)]">Sounds</span>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => { unlockAudio(); playSound("receive"); }} className="text-sm text-[var(--brand)]">Preview</button>
              <input
                type="checkbox"
                checked={soundOn}
                onChange={(event) => {
                  setSoundOn(event.target.checked);
                  setSoundOnState(event.target.checked);
                }}
                aria-label="Sounds"
                className="h-5 w-5"
              />
            </div>
          </div>
          {installPrompt && (
            <button
              type="button"
              onClick={async () => {
                await installPrompt.prompt();
                await installPrompt.userChoice.catch(() => undefined);
                setInstallPrompt(null);
              }}
              className="min-h-14 w-full px-4 flex items-center justify-between gap-3 text-left"
            >
              <span className="text-[15px] text-[var(--ink)]">Install app</span>
              <span className="text-sm text-[var(--ink-muted)]">Available</span>
            </button>
          )}
        </section>

        <section className="mt-4 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)]">
          <Link href="/offline" className="min-h-14 px-4 flex items-center justify-between gap-3">
            <span className="text-[15px] text-[var(--ink)]">Help</span>
            <span className="text-sm text-[var(--ink-muted)]">Offline help</span>
          </Link>
        </section>

        <button
          type="button"
          onClick={signOut}
          disabled={signingOut}
          className="mt-6 h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-red-600 font-medium disabled:opacity-60"
        >
          {signingOut ? "Signing out..." : "Sign out"}
        </button>
      </main>
    </div>
  );
}