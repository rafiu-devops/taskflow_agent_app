"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageSquarePlus, Plus, Search } from "lucide-react";
import type { ConversationSummary } from "@/types/agent";
import ConversationList from "@/components/history/ConversationList";

type ConversationFetchResult = { conversations?: ConversationSummary[]; error?: string };

async function fetchConversations(): Promise<ConversationFetchResult> {
  try {
    const response = await fetch("/api/conversations", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { error: data.error || "Unable to load history" };
    return { conversations: data.conversations ?? [] };
  } catch {
    return { error: "Unable to load history" };
  }
}

/** Conversation history: searchable, grouped by day, with rename/delete. */
export default function HistoryClient() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const apply = useCallback((result: ConversationFetchResult) => {
    if (result.error) setError(result.error);
    else {
      setConversations(result.conversations ?? []);
      setError(null);
    }
  }, []);

  const load = useCallback(async () => {
    apply(await fetchConversations());
    setLoading(false);
  }, [apply]);

  useEffect(() => {
    let cancelled = false;
    fetchConversations().then((result) => {
      if (cancelled) return;
      apply(result);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((conversation) =>
      [conversation.title, conversation.lastMessage ?? ""].join(" ").toLowerCase().includes(q),
    );
  }, [conversations, query]);

  return (
    <div className="tf-scroll h-full min-h-0 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-12 sm:px-6 sm:pt-8 lg:px-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="tf-eyebrow">Conversations</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
              Chat history
            </h1>
            <p className="mt-1.5 text-[13.5px] text-ink-muted">
              {loading
                ? "Loading your conversations…"
                : `${conversations.length} conversation${conversations.length === 1 ? "" : "s"} saved to your account`}
            </p>
          </div>

          <Link href="/chat" className="tf-btn-primary h-11 shrink-0 px-4 text-sm">
            <Plus className="h-4.5 w-4.5" aria-hidden="true" />
            New chat
          </Link>
        </header>

        <label className="mt-6 flex items-center gap-2.5 rounded-2xl border border-border bg-surface px-4 py-3 shadow-card transition focus-within:border-brand focus-within:shadow-glow">
          <Search className="h-4.5 w-4.5 shrink-0 text-ink-muted" aria-hidden="true" />
          <span className="sr-only">Search conversations</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search conversations..."
            className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold text-ink-muted transition hover:bg-surface-soft hover:text-ink"
            >
              Clear
            </button>
          )}
        </label>

        {error && (
          <p
            role="alert"
            className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3.5 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
          >
            {error}
          </p>
        )}

        <div className="mt-7">
          {loading ? (
            <div className="space-y-3" aria-busy="true" aria-label="Loading conversations">
              {Array.from({ length: 5 }, (_, index) => (
                <div
                  key={index}
                  className="h-[74px] animate-pulse rounded-2xl bg-surface-soft"
                  style={{ animationDelay: `${index * 80}ms` }}
                />
              ))}
            </div>
          ) : (
            <ConversationList
              conversations={filtered}
              variant="page"
              preset="page"
              onChanged={load}
              empty={
                <EmptyState query={query} hasAny={conversations.length > 0} />
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** Search-aware empty state for the history page. */
function EmptyState({ query, hasAny }: { query: string; hasAny: boolean }) {
  if (query) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-surface-soft/50 px-6 py-14 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-surface text-ink-muted">
          <Search className="h-6 w-6" aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-base font-semibold text-ink">No matching conversations</h2>
        <p className="mx-auto mt-2 max-w-sm text-[13.5px] leading-6 text-ink-muted">
          Nothing matches “{query}”. Try a different search term.
        </p>
      </div>
    );
  }

  if (hasAny) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-surface-soft/50 px-6 py-14 text-center">
        <p className="text-[13.5px] text-ink-muted">No conversations match your search.</p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-dashed border-border bg-surface-soft/50 px-6 py-14 text-center">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand/12 text-brand">
        <MessageSquarePlus className="h-6 w-6" aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-base font-semibold text-ink">No conversations yet</h2>
      <p className="mx-auto mt-2 max-w-sm text-[13.5px] leading-6 text-ink-muted">
        Ask TaskFlow AI a question and your history will appear here.
      </p>
      <Link href="/chat" className="tf-btn-primary mt-6 h-11 px-5 text-sm">
        Start a new chat
      </Link>
    </div>
  );
}
