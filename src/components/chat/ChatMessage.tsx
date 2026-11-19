"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Copy, RotateCcw } from "lucide-react";
import type { ChatMessage as Message } from "@/types/agent";
import { renderToolResult } from "@/components/agent/tool-renderers";
import MarkdownMessage from "@/components/chat/MarkdownMessage";
import { cn, initials } from "@/lib/utils";

function textOf(message: Message): string {
  return (message.parts ?? [])
    .filter((part) => part.type === "text")
    .map((part) => (part as { text: string }).text)
    .join("\n");
}

type ChatMessageRowProps = {
  message: Message;
  conversationId: string | null;
  /** Renders the compact date/time separator above the row. */
  showTimestamp?: boolean;
  onRetry?: (text: string) => void;
  userName?: string;
};

/** Single conversation row: user bubble, assistant surface, tool cards. */
export default function ChatMessageRow({
  message,
  conversationId,
  showTimestamp = false,
  onRetry,
  userName,
}: ChatMessageRowProps) {
  const reducedMotion = useReducedMotion();
  const isUser = message.role === "user";
  const plainText = textOf(message);
  const time = new Date(message.createdAt);

  return (
    <div className="group/msg relative">
      {showTimestamp && (
        <p
          className="mb-5 text-center text-[11px] font-medium text-ink-muted"
          title={time.toLocaleString()}
        >
          {time.toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      )}

      <motion.div
        initial={reducedMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        title={time.toLocaleString()}
        className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}
      >
        {!isUser && (
          <span
            aria-hidden="true"
            className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand text-[10px] font-bold text-white shadow-[0_6px_14px_rgba(37,99,235,0.35)]"
          >
            TF
          </span>
        )}

        <div className={cn("min-w-0", isUser ? "max-w-[86%] sm:max-w-[76%]" : "flex-1")}>
          {isUser ? (
            <div className="rounded-2xl rounded-br-md border border-brand/18 bg-brand/8 px-4 py-2.5">
              <p className="whitespace-pre-wrap break-words text-[14.5px] leading-6 text-ink" dir="auto">
                {plainText}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {(message.parts ?? []).map((part, index) => {
                if (part.type === "text") {
                  return (
                    <div
                      key={`text-${index}`}
                      className="rounded-2xl rounded-tl-md border border-border bg-surface px-4 py-3 shadow-card"
                    >
                      <MarkdownMessage content={part.text} />
                    </div>
                  );
                }
                if (part.type === "tool-result") {
                  return <div key={part.id || `tool-${index}`}>{renderToolResult(part, undefined, conversationId)}</div>;
                }
                return null;
              })}
            </div>
          )}

          <div
            className={cn(
              "mt-1.5 flex items-center gap-1 transition",
              "opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/msg:opacity-100 group-focus-within/msg:opacity-100",
              isUser ? "justify-end" : "justify-start",
            )}
          >
            <button
              type="button"
              onClick={() => void navigator.clipboard?.writeText(plainText)}
              aria-label="Copy message"
              className="grid h-7 w-7 place-items-center rounded-lg text-ink-muted transition hover:bg-surface-soft hover:text-ink"
            >
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            </button>

            {isUser && onRetry && (
              <button
                type="button"
                onClick={() => onRetry(plainText)}
                aria-label="Send this message again"
                className="grid h-7 w-7 place-items-center rounded-lg text-ink-muted transition hover:bg-surface-soft hover:text-ink"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {isUser && (
          <span
            aria-hidden="true"
            className="mt-0.5 hidden h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-soft text-[10px] font-bold text-ink sm:grid"
          >
            {initials(userName)}
          </span>
        )}
      </motion.div>
    </div>
  );
}

/** Shown while the agent is running tools or composing a reply. */
export function TypingIndicator() {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand text-[10px] font-bold text-white"
      >
        TF
      </span>
      <div
        role="status"
        aria-label="TaskFlow AI is thinking"
        className="flex items-center gap-1.5 rounded-2xl rounded-tl-md border border-border bg-surface px-4 py-3.5 shadow-card"
      >
        {[0, 1, 2].map((index) => (
          <motion.span
            key={index}
            className="h-2 w-2 rounded-full bg-brand/45"
            animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 0.9, repeat: Infinity, delay: index * 0.15 }}
          />
        ))}
      </div>
    </div>
  );
}
