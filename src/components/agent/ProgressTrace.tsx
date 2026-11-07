"use client";

import type { ToolResultPart } from "@/types/agent";

const TOOL_LABELS: Record<string, string> = {
  list_tasks: "Checking your tasks…",
  get_report: "Loading your report…",
  propose_assign_task: "Preparing assignment…",
};

export default function ProgressTrace({ part }: { part: ToolResultPart }) {
  if (part.state === "running") {
    return <div className="h-4 w-48 animate-pulse rounded bg-[var(--border)]" aria-label={TOOL_LABELS[part.tool] ?? "Working…"} />;
  }
  return (
    <details className="text-xs text-[var(--ink-muted)]">
      <summary className="cursor-pointer">What I did ›</summary>
      <p className="mt-1">{part.tool}</p>
    </details>
  );
}
