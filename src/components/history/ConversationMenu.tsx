"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, Pencil, Trash2, X } from "lucide-react";
import type { ConversationSummary } from "@/types/agent";
import { cn } from "@/lib/utils";

type ConversationMenuProps = {
  conversation: ConversationSummary;
  onChange: () => void;
  align?: "left" | "right";
  /** `dark` renders on the navy sidebar, `light` on pale surfaces. */
  tone?: "light" | "dark";
};

export default function ConversationMenu({
  conversation,
  onChange,
  align = "right",
  tone = "light",
}: ConversationMenuProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"menu" | "rename" | "delete" | null>(null);
  const [title, setTitle] = useState(conversation.title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open && !mode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setMode(null);
      }
    };
    const onPointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
        setMode(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, [open, mode]);

  async function rename() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/conversations/${encodeURIComponent(conversation.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to rename");
      setMode(null);
      setOpen(false);
      onChange();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to rename");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/conversations/${encodeURIComponent(conversation.id)}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to delete");
      setMode(null);
      setOpen(false);
      onChange();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to delete");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Conversation actions"
        aria-expanded={open || Boolean(mode)}
        onClick={() => {
          setOpen((value) => !value);
          setMode(null);
          setTitle(conversation.title);
          setError(null);
        }}
        className={cn(
          "grid h-9 w-9 place-items-center rounded-xl transition",
          tone === "dark"
            ? "text-white/55 hover:bg-white/12 hover:text-white"
            : "text-ink-muted hover:bg-surface-soft hover:text-ink",
        )}
      >
        <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
      </button>

      {open && !mode && (
        <div className={cn("absolute z-30 mt-2 w-44 overflow-hidden rounded-2xl border border-border bg-surface py-2 shadow-float", align === "right" ? "right-0" : "left-0")}>
          <button type="button" onClick={() => setMode("rename")} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-medium text-ink transition hover:bg-surface-soft">
            <Pencil className="h-4 w-4" aria-hidden="true" /> Rename
          </button>
          <button type="button" onClick={() => setMode("delete")} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-medium text-danger transition hover:bg-danger/8">
            <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete
          </button>
        </div>
      )}

      {mode && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-[var(--scrim)] p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="conversation-menu-title">
          <div className="w-full max-w-sm rounded-3xl border border-border bg-surface p-5 shadow-float">
            <div className="flex items-start justify-between gap-3">
              <h2 id="conversation-menu-title" className="text-base font-semibold text-ink">
                {mode === "rename" ? "Rename conversation" : "Delete conversation"}
              </h2>
              <button type="button" onClick={() => { setMode(null); setOpen(false); }} className="rounded-xl p-2 text-ink-muted hover:bg-surface-soft" aria-label="Close">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            {mode === "rename" ? (
              <>
                <input value={title} onChange={(event) => setTitle(event.target.value)} autoFocus className="tf-field mt-4 px-4 py-3" aria-label="Conversation title" />
                {error && <p role="alert" className="mt-2 text-xs text-danger">{error}</p>}
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" onClick={() => { setMode(null); setOpen(false); }} className="tf-btn-ghost h-10 px-4 text-sm">Cancel</button>
                  <button type="button" onClick={rename} disabled={busy} className="tf-btn-primary h-10 px-4 text-sm">{busy ? "Saving..." : "Rename"}</button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-3 text-sm leading-6 text-ink-muted">This removes the conversation and its messages from this device/account only. It cannot be undone.</p>
                {error && <p role="alert" className="mt-2 text-xs text-danger">{error}</p>}
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" onClick={() => { setMode(null); setOpen(false); }} className="tf-btn-ghost h-10 px-4 text-sm">Cancel</button>
                  <button type="button" onClick={remove} disabled={busy} className="h-10 rounded-xl bg-danger px-4 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60">{busy ? "Deleting..." : "Delete"}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

