"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

const POINTS = [
  {
    title: "Permission-aware by design",
    body: "Every answer and action is re-checked against your TaskFlow role and grants before it reaches the management backend.",
  },
  {
    title: "Real data, no guessing",
    body: "Tasks, employees, departments and performance are read live from your TaskFlow workbook through the management API.",
  },
  {
    title: "Your conversations stay yours",
    body: "Chat history is stored per account. Other users cannot open your conversations.",
  },
];

/** About dialog opened from the sidebar navigation. */
export default function AboutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    closeRef.current?.focus();
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="presentation">
      <button
        type="button"
        aria-label="Close about dialog"
        onClick={onClose}
        className="absolute inset-0 bg-[var(--scrim)] backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        className="relative w-full max-w-lg overflow-hidden rounded-[1.75rem] border border-border bg-surface shadow-float"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border bg-surface-soft px-6 py-5">
          <div>
            <p className="tf-eyebrow">About</p>
            <h2 id="about-title" className="mt-1.5 text-lg font-bold tracking-tight text-ink">
              TaskFlow AI Agent
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-ink-muted transition hover:bg-surface hover:text-ink"
          >
            <X className="h-4.5 w-4.5" aria-hidden="true" />
          </button>
        </div>

        <div className="px-6 py-5">
          <p className="text-sm leading-6 text-ink-muted">
            An intelligent assistant for workforce management and administrative tasks. Ask in
            English or Roman Urdu — TaskFlow handles both.
          </p>

          <ul className="mt-5 space-y-4">
            {POINTS.map((point) => (
              <li key={point.title} className="flex gap-3">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand/12 text-[11px] font-bold text-brand">
                  ✓
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink">{point.title}</span>
                  <span className="mt-1 block text-[13px] leading-5 text-ink-muted">
                    {point.body}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border bg-surface-soft px-6 py-4">
          <p className="text-[11px] text-ink-muted">Powered by Gemini tool calling</p>
          <button type="button" onClick={onClose} className="tf-btn-primary h-10 px-5 text-sm">
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
