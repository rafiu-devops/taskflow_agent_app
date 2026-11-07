"use client";

import { z } from "zod";
import type { ToolResultPart } from "@/types/agent";

const schema = z.object({
  metrics: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
  card: z.any().optional(),
});

export default function ReportCard({ part }: { part: ToolResultPart }) {
  const parsed = schema.safeParse(part.output);
  const metrics = parsed.success ? (parsed.data.metrics ?? parsed.data.card?.metrics ?? []) : [];
  if (!metrics.length) return null;

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="grid gap-3 sm:grid-cols-4">
        {metrics.map((metric: { label: string; value: string }) => (
          <div key={metric.label}>
            <p className="text-3xl font-semibold tabular-nums text-[var(--ink)]">{metric.value}</p>
            <p className="text-xs text-[var(--ink-muted)]">{metric.label}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-2 text-xs">
        <button type="button" className="font-medium text-[var(--brand)]">Ask follow-up</button>
        <button type="button" className="font-medium text-[var(--brand)]">Export</button>
      </div>
    </section>
  );
}
