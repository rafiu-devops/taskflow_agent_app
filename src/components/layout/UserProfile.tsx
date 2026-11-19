"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut, Settings } from "lucide-react";
import type { AgentUser } from "@/types/agent";
import { initials } from "@/lib/utils";

type UserProfileProps = {
  user: AgentUser;
  /** `dark` sits on the navy sidebar, `light` on pale surfaces. */
  tone?: "light" | "dark";
  onNavigate?: () => void;
  compact?: boolean;
};

/**
 * Signed-in user block. Name, avatar and role all come from the authenticated
 * profile — nothing here is hardcoded.
 */
export default function UserProfile({
  user,
  tone = "dark",
  onNavigate,
  compact = false,
}: UserProfileProps) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const isDark = tone === "dark";

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
    <div
      className={
        isDark
          ? "flex items-center gap-3 border-t border-white/10 pt-3"
          : "flex items-center gap-3 border-t border-border pt-3"
      }
    >
      <span
        aria-hidden="true"
        className={
          isDark
            ? "grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-bright to-brand text-[13px] font-bold text-white shadow-[0_6px_16px_rgba(23,101,255,0.45)]"
            : "grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand text-[13px] font-bold text-white"
        }
      >
        {initials(user.name)}
      </span>

      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-[13.5px] font-semibold ${isDark ? "text-white" : "text-ink"}`}
        >
          {user.name}
        </span>
        <span
          className={`mt-0.5 flex items-center gap-1.5 text-[11px] ${isDark ? "text-white/55" : "text-ink-muted"}`}
        >
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${user.role === "admin" ? "bg-accent-violet" : "bg-success"}`}
            aria-hidden="true"
          />
          {user.role === "admin" ? "Admin" : "Employee"}
        </span>
      </span>

      {!compact && (
        <>
          <Link
            href="/settings"
            onClick={onNavigate}
            aria-label="Settings"
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl transition ${
              isDark
                ? "text-white/55 hover:bg-white/10 hover:text-white"
                : "text-ink-muted hover:bg-surface-soft hover:text-ink"
            }`}
          >
            <Settings className="h-4 w-4" aria-hidden="true" />
          </Link>

          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            aria-label="Sign out"
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl transition disabled:opacity-60 ${
              isDark
                ? "text-white/55 hover:bg-white/10 hover:text-white"
                : "text-ink-muted hover:bg-danger/10 hover:text-danger"
            }`}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </button>
        </>
      )}
    </div>
  );
}
