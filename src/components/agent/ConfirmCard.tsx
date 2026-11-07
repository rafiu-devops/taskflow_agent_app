"use client";

import { useState } from "react";
import { z } from "zod";
import type { ToolResultPart } from "@/types/agent";

const schema = z.object({
  proposalId: z.string().optional(),
  summary: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
  expiresAt: z.string().optional(),
  card: z.any().optional(),
});

export default function ConfirmCard({ part }: { part: ToolResultPart }) {
  const parsed = schema.safeParse(part.output);
  const data = parsed.success ? parsed.data : {};
  const [state, setState] = useState<"pending" | "done" | "cancelled" | "expired">("pending");
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (!data.proposalId) return;
    setBusy(true);
    try {
      const response = await fetch("/api/agent/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ proposalId: data.proposalId, decision: "confirm" }),
      });
      if (!response.ok) throw new Error("Failed");
      setState("done");
    } catch {
      setState("expired");
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (data.proposalId) {
      await fetch("/api/agent/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ proposalId: data.proposalId, decision: "cancel" }),
      }).catch(() => undefined);
    }
    setState("cancelled");
  }

  if (state === "cancelled") {
    return <p className="text-xs text-[var(--ink-muted)]">Cancelled.</p>;
  }
  if (state === "done") {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        Done. <button type="button" className="ml-2 text-xs font-semibold underline">Undo</button>
      </div>
    );
  }
  if (state === "expired") {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        This proposal expired. <button type="button" className="ml-2 text-xs font-semibold underline">Ask again</button>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="space-y-2">
        {(data.summary ?? []).map((item) => (
          <div key={item.label} className="flex items-center justify-between text-sm">
            <span className="text-[var(--ink-muted)]">{item.label}</span>
            <span className="font-medium text-[var(--ink)]">{item.value}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={confirm} disabled={busy} className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
          {busy ? "Confirming..." : "Confirm"}
        </button>
        <button type="button" className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--ink-muted)]">Edit</button>
        <button type="button" onClick={cancel} className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--ink-muted)]">Cancel</button>
      </div>
    </section>
  );
}
