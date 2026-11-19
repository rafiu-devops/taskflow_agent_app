"use client";

import { Menu, MessageSquare } from "lucide-react";
import type { ConversationSummary } from "@/types/agent";
import ConversationMenu from "@/components/history/ConversationMenu";
import { cn } from "@/lib/utils";

type ConversationHeaderProps = {
  conversationId: string | null;
  title: string;
  messageCount: number;
  onOpenMenu: () => void;
  /** Fired after rename/delete so the caller can refresh. */
  onChanged: () => void;
  className?: string;
};

/** Top bar shown once a thread has messages: menu, title and thread actions. */
export default function ConversationHeader({
  conversationId,
  title,
  messageCount,
  onOpenMenu,
  onChanged,
  className,
}: ConversationHeaderProps) {
  const summary: ConversationSummary = {
    id: conversationId ?? "pending",
    ownerId: "",
    title,
    createdAt: "",
    updatedAt: "",
    messageCount,
  };

  return (
    <header
      className={cn(
        "flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface/85 px-2.5 backdrop-blur-xl sm:px-4",
        className,
      )}
    >
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Open menu"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-ink transition hover:bg-surface-soft lg:hidden"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      <span
        aria-hidden="true"
        className="hidden h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand/12 text-brand lg:grid"
      >
        <MessageSquare className="h-4.5 w-4.5" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold leading-5 text-ink">{title}</span>
        <span className="block truncate text-[11px] text-ink-muted">
          {messageCount} message{messageCount === 1 ? "" : "s"}
          <span className="mx-1.5 text-border">·</span>
          TaskFlow AI
        </span>
      </span>

      {conversationId && (
        <ConversationMenu conversation={summary} onChange={onChanged} align="right" />
      )}
    </header>
  );
}
