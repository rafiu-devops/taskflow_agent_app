export function normalizeResponse(raw: unknown): Array<{ type: "text"; text: string } | { type: "tool-result"; id: string; tool: string; state: "running" | "done" | "error"; input?: unknown; output?: unknown; error?: { message: string; retryable: boolean } }> {
  const message = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rawParts = Array.isArray(message.parts) ? message.parts : [];
  const parts = rawParts.map((part) => {
    const p = (part && typeof part === "object" ? part : {}) as Record<string, unknown>;
    if (p.type === "tool-result") {
      return {
        type: "tool-result" as const,
        id: String(p.id ?? ""),
        tool: String(p.tool ?? "unknown"),
        state: (p.state === "running" || p.state === "error" ? p.state : "done") as "running" | "error" | "done",
        input: p.input,
        output: p.output,
        error: p.error && typeof p.error === "object" ? (p.error as { message: string; retryable: boolean }) : undefined,
      };
    }
    return { type: "text" as const, text: String(p.text ?? p.content ?? "") };
  });
  if (!parts.length && typeof message.content === "string" && message.content.trim()) {
    parts.push({ type: "text", text: message.content });
  }
  if (!parts.length) {
    parts.push({ type: "text", text: "" });
  }
  return parts;
}
