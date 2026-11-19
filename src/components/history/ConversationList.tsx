"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquare } from "lucide-react";
import type { ConversationSummary } from "@/types/agent";
import {
  fullTimestamp,
  groupConversations,
  relativeTime,
  type GroupingPreset,
} from "@/lib/conversations/grouping";
import ConversationMenu from "@/components/history/ConversationMenu";
import { cn } from "@/lib/utils";

type ConversationListProps = {
  conversations: ConversationSummary[];
  variant: "sidebar" | "page";
  preset?: GroupingPreset;
  /** Called after a rename or delete so the caller can refetch. */
  onChanged: () => void;
  /** Called after the row link is activated (closes drawers/menus). */
  onOpen?: () => void;
  empty?: React.ReactNode;
};

/**
 * Shared grouped conversation list used by the sidebar (compact, on navy) and
 * the history page (full-width cards). Storage and access control are the
 * existing owner-scoped Firestore conversations — nothing new is persisted.
 */
export default function ConversationList({
  conversations,
  variant,
  preset,
  onChanged,
  onOpen,
  empty,
}: ConversationListProps) {
  const pathname = usePathname();
  const groups = groupConversations(conversations, preset ?? (variant === "sidebar" ? "sidebar" : "page"));

  if (!conversations.length) {
    return <>{empty}</>;
  }

  const isSidebar = variant === "sidebar";

  return (
    <div className={cn("space-y-5", isSidebar ? "" : "space-y-7")}>
      {groups.map((group) => (
        <section key={group.label}>
          <h3
            className={cn(
              "px-1 text-[10.5px] font-bold uppercase tracking-[0.16em]",
              isSidebar ? "text-white/45" : "text-ink-muted",
            )}
          >
            {group.label}
          </h3>

          <ul className={cn("mt-1.5", isSidebar ? "space-y-0.5" : "space-y-2")}>
            {group.items.map((conversation) => {
              const active = pathname === `/chat/${conversation.id}`;

              return (
                <li key={conversation.id} className="group/row flex items-center gap-1">
                  <Link
                    href={`/chat/${conversation.id}`}
                    onClick={onOpen}
                    title={fullTimestamp(conversation.updatedAt)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "min-w-0 flex-1 rounded-xl transition",
                      isSidebar
                        ? "px-3 py-2.5 text-[13px] hover:bg-white/8"
                        : "px-3.5 py-3 text-sm hover:bg-surface-soft",
                      active && (isSidebar ? "bg-white/10" : "bg-surface-soft"),
                    )}
                  >
                    <span
                      className={cn(
                        "block truncate font-medium",
                        isSidebar
                          ? active
                            ? "text-white"
                            : "text-white/70 group-hover/row:text-white"
                          : active
                            ? "text-brand"
                            : "text-ink",
                      )}
                    >
                      {conversation.title}
                    </span>
                    {!isSidebar && (
                      <span className="mt-1 block truncate text-[11.5px] text-ink-muted">
                        {conversation.lastMessage ||
                          `${conversation.messageCount} message${conversation.messageCount === 1 ? "" : "s"}`}
                      </span>
                    )}
                    {isSidebar && (
                      <span className="mt-0.5 block text-[10.5px] text-white/40">
                        {relativeTime(conversation.updatedAt)}
                      </span>
                    )}
                  </Link>

                  <div
                    className={cn(
                      "shrink-0 transition group-focus-within/row:opacity-100 [@media(hover:hover)]:group-hover/row:opacity-100",
                      isSidebar ? "opacity-60 hover:opacity-100" : "opacity-100",
                    )}
                  >
                    <ConversationMenu
                      conversation={conversation}
                      onChange={onChanged}
                      tone={isSidebar ? "dark" : "light"}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Empty state used when a user has no conversations yet. */
export function ConversationListEmpty({ variant }: { variant: "sidebar" | "page" }) {
  const isSidebar = variant === "sidebar";
  return (
    <div className={cn("rounded-2xl px-4 py-6 text-center", isSidebar ? "bg-white/5" : "border border-dashed border-border bg-surface-soft/60")}>
      <span
        className={cn(
          "mx-auto grid h-10 w-10 place-items-center rounded-xl",
          isSidebar ? "bg-white/10 text-white/70" : "bg-brand/10 text-brand",
        )}
      >
        <MessageSquare className="h-5 w-5" aria-hidden="true" />
      </span>
      <p className={cn("mt-3 text-[13px] font-semibold", isSidebar ? "text-white" : "text-ink")}>
        No conversations yet
      </p>
      <p className={cn("mt-1 text-[12px] leading-5", isSidebar ? "text-white/55" : "text-ink-muted")}>
        Ask your first question and it will appear here.
      </p>
    </div>
  );
}
