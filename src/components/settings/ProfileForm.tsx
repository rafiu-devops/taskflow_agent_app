"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Pencil, UserRound, X } from "lucide-react";
import type { AgentUser } from "@/types/agent";
import { initials, cn } from "@/lib/utils";
import { maxDisplayNameLength, normalizeDisplayName } from "@/lib/displayName";
import { useAppShell } from "@/components/layout/AppShell";

type ProfileFormProps = {
  user: AgentUser;
};

/**
 * Editable profile card: avatar, display name and identity facts.
 *
 * Saving calls `PATCH /api/profile`, which stores the name against the
 * caller's own Firestore profile document. The live shell user is updated in
 * place so the sidebar, greeting and header all refresh immediately, and
 * `router.refresh()` re-renders the server layout so the change survives
 * navigation.
 */
export default function ProfileForm({ user }: ProfileFormProps) {
  const router = useRouter();
  const shell = useAppShell();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(user.name);
  const [prevName, setPrevName] = useState(user.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const maxLength = maxDisplayNameLength();

  // Keep the field in sync when the server refreshes with a newer name —
  // adjusted during render so an in-progress edit is never clobbered and the
  // hydration pass stays a no-op (prevName starts as the server value).
  if (!editing && prevName !== user.name) {
    setPrevName(user.name);
    setDraft(user.name);
  }

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function startEditing() {
    setDraft(user.name);
    setError(null);
    setSaved(false);
    setEditing(true);
  }

  function cancelEditing() {
    setDraft(user.name);
    setError(null);
    setEditing(false);
  }

  async function save() {
    const cleaned = normalizeDisplayName(draft);
    if (!cleaned) {
      setError("Please enter a display name.");
      return;
    }

    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: cleaned }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        user?: AgentUser;
        error?: string;
      };

      if (!response.ok || !data.user) {
        setError(data.error || "Unable to save your display name. Please try again.");
        return;
      }

      shell.updateUser(data.user);
      setDraft(data.user.name);
      setEditing(false);
      setSaved(true);
      router.refresh();
      window.setTimeout(() => setSaved(false), 2600);
    } catch {
      setError("Unable to reach the server. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <span
          aria-hidden="true"
          className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-bright to-brand text-lg font-bold text-white shadow-[0_12px_28px_rgba(37,99,235,0.32)]"
        >
          {initials(user.name)}
        </span>

        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-ink">{user.name}</p>
          <p className="mt-0.5 truncate text-[13px] text-ink-muted">{user.email}</p>
          <span
            className={cn(
              "mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide",
              user.role === "admin"
                ? "bg-accent-violet/12 text-accent-violet"
                : "bg-success/12 text-success",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                user.role === "admin" ? "bg-accent-violet" : "bg-success",
              )}
            />
            {user.role === "admin" ? "Admin" : "Employee"}
          </span>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface-soft/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="display-name" className="text-[13px] font-semibold text-ink">
            Display name
          </label>
          {!editing && (
            <button
              type="button"
              onClick={startEditing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-ink transition hover:border-brand hover:text-brand"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              Edit
            </button>
          )}
        </div>

        {editing ? (
          <div className="mt-2.5">
            <input
              ref={inputRef}
              id="display-name"
              value={draft}
              maxLength={maxLength}
              onChange={(event) => {
                setDraft(event.target.value);
                if (error) setError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void save();
                }
                if (event.key === "Escape") cancelEditing();
              }}
              placeholder="e.g. Rafey Ahmed"
              className="tf-field h-11 px-3.5 text-sm"
              aria-describedby="display-name-help"
            />
            <p id="display-name-help" className="mt-1.5 text-[11.5px] text-ink-muted">
              Used for your greeting and profile. Never your full email address.{" "}
              {draft.length}/{maxLength}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                className="tf-btn-primary h-9 px-4 text-[13px]"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Check className="h-4 w-4" aria-hidden="true" />
                )}
                {saving ? "Saving..." : "Save name"}
              </button>
              <button
                type="button"
                onClick={cancelEditing}
                disabled={saving}
                className="tf-btn-ghost h-9 px-4 text-[13px]"
              >
                <X className="h-4 w-4" aria-hidden="true" />
                Cancel
              </button>
            </div>

            {error && (
              <p role="alert" className="mt-2.5 text-[12.5px] font-medium text-danger">
                {error}
              </p>
            )}
          </div>
        ) : (
          <div className="mt-2 flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-sm text-ink-muted">{user.name}</p>
            {saved && (
              <span
                role="status"
                className="inline-flex shrink-0 items-center gap-1.5 text-[12px] font-semibold text-success"
              >
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                Saved
              </span>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Fact label="Employee ID" value={user.employeeId ?? "Not linked"} icon={UserRound} />
        <Fact
          label="Department ID"
          value={user.departmentId ?? "Not linked"}
          icon={UserRound}
        />
      </div>
    </div>
  );
}

function Fact({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof UserRound;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface px-4 py-3">
      <p className="flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wide text-ink-muted">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </p>
      <p className="mt-1 truncate text-[13.5px] font-semibold text-ink">{value}</p>
    </div>
  );
}
