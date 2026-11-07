"use client";

import type { ToolResultPart } from "@/types/agent";

export default function ErrorNotice({ part, onRetry }: { part: ToolResultPart; onRetry?: () => void }) {
  const message = part.error?.message ?? "Something went wrong.";
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      <p>{message}</p>
      {part.error?.retryable && onRetry && (
        <button type="button" onClick={onRetry} className="mt-1 text-xs font-semibold underline">Retry</button>
      )}
    </div>
  );
}
