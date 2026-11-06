"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, Pencil, Trash2, X } from "lucide-react";
import type { ConversationSummary } from "@/types/agent";
import { cn } from "@/lib/utils";

type ConversationMenuProps = {
  conversation: ConversationSummary;
  onChange: () => void;
  align?: "left" | "right";
};

export default function ConversationMenu({ conversation, onChange, align = "right" }: ConversationMenuProps) {
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
        className="grid h-9 w-9 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-navy"
      >
        <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
      </button>

      {open && !mode && (
        <div className={cn("absolute z-30 mt-2 w-44 overflow-hidden rounded-2xl border border-line bg-white py-2 shadow-xl", align === "right" ? "right-0" : "left-0")}>
          <button type="button" onClick={() => setMode("rename")} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Pencil className="h-4 w-4" aria-hidden="true" /> Rename
          </button>
          <button type="button" onClick={() => setMode("delete")} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-medium text-rose-600 hover:bg-rose-50">
            <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete
          </button>
        </div>
      )}

      {mode && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-navy/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="conversation-menu-title">
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <h2 id="conversation-menu-title" className="text-base font-semibold text-navy">
                {mode === "rename" ? "Rename conversation" : "Delete conversation"}
              </h2>
              <button type="button" onClick={() => { setMode(null); setOpen(false); }} className="rounded-xl p-2 text-muted hover:bg-slate-100" aria-label="Close">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            {mode === "rename" ? (
              <>
                <input value={title} onChange={(event) => setTitle(event.target.value)} autoFocus className="mt-4 w-full rounded-2xl border border-line bg-[#F7FBFE] px-4 py-3 text-sm outline-none focus:border-primary focus:bg-white" />
                {error && <p role="alert" className="mt-2 text-xs text-rose-600">{error}</p>}
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" onClick={() => { setMode(null); setOpen(false); }} className="rounded-2xl border border-line px-4 py-2 text-sm font-semibold text-slate-600">Cancel</button>
                  <button type="button" onClick={rename} disabled={busy} className="rounded-2xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{busy ? "Saving..." : "Rename"}</button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-3 text-sm leading-6 text-muted">This removes the conversation and its messages from this device/account only. It cannot be undone.</p>
                {error && <p role="alert" className="mt-2 text-xs text-rose-600">{error}</p>}
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" onClick={() => { setMode(null); setOpen(false); }} className="rounded-2xl border border-line px-4 py-2 text-sm font-semibold text-slate-600">Cancel</button>
                  <button type="button" onClick={remove} disabled={busy} className="rounded-2xl bg-rose-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{busy ? "Deleting..." : "Delete"}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
