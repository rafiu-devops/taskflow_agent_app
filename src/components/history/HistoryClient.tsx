"use client";

import Link from "next/link";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageSquarePlus, Plus, Search } from "lucide-react";
import type { ConversationSummary } from "@/types/agent";
import AppHeader from "@/components/layout/AppHeader";
import ConversationMenu from "@/components/history/ConversationMenu";

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

export default function HistoryClient() {

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const applyConversationResult = useCallback((result: ConversationFetchResult) => {
    if (result.error) {
      setError(result.error);
    } else {
      setConversations(result.conversations ?? []);
      setError(null);
    }
  }, []);

  const load = useCallback(async () => {
    applyConversationResult(await fetchConversations());
    setLoading(false);
  }, [applyConversationResult]);

  useEffect(() => {
    let cancelled = false;
    fetchConversations().then((result) => {
      if (cancelled) return;
      applyConversationResult(result);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [applyConversationResult]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((conversation) => [conversation.title, conversation.lastMessage ?? ""].join(" ").toLowerCase().includes(q));
  }, [conversations, query]);

  const groups = useMemo(() => groupConversations(filtered), [filtered]);

  return (
    <div className="min-h-screen px-4 pb-10 pt-4 sm:px-6 lg:px-8">
      <AppHeader
        variant="secondary"
        title="Recent History"
        right={
          <Link href="/chat" aria-label="New chat" className="grid h-10 w-10 place-items-center rounded-xl text-[var(--brand)] hover:bg-[var(--bg)]">
            <Plus className="h-5 w-5" aria-hidden="true" />
          </Link>
        }
      />

      <main className="mx-auto mt-6 max-w-4xl">
        <div className="rounded-[2.5rem] border border-white/70 bg-[var(--surface)]/80 p-4 shadow-[0_24px_60px_rgba(7,20,38,0.10)] backdrop-blur sm:p-6">
          <label className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[#F7FBFE] px-4 py-3 focus-within:border-primary focus-within:bg-[var(--surface)]">
            <Search className="h-4 w-4 text-[var(--ink-muted)]" aria-hidden="true" />
            <span className="sr-only">Search history</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search conversations..." className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--ink-muted)]" />
          </label>

          {error && <p role="alert" className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}

          {loading ? (
            <div className="mt-5 space-y-3">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-20 animate-pulse rounded-3xl bg-[var(--border)]" />)}</div>
          ) : groups.length ? (
            <div className="mt-5 space-y-7">
              {groups.map((group) => (
                <section key={group.label} aria-labelledby={`history-${group.label}`}>
                  <h2 id={`history-${group.label}`} className="px-2 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--ink-muted)]">{group.label}</h2>
                  <ul className="mt-2 divide-y divide-line/70">
                    {group.items.map((conversation) => (
                      <li key={conversation.id} className="flex items-center gap-2 py-2">
                        <Link href={`/chat/${conversation.id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-3xl p-3 transition hover:bg-[var(--bg)]">
                          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[var(--ink)] text-[10px] font-black text-[var(--surface)]">TF</div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[var(--ink)]">{conversation.title}</p>
                            <p className="mt-1 text-[11px] text-[var(--ink-muted)]">{relativeTime(conversation.updatedAt)} · {conversation.messageCount} message{conversation.messageCount === 1 ? "" : "s"}</p>
                            {conversation.lastMessage && <p className="mt-0.5 truncate text-[11px] text-[var(--ink-muted)]">{conversation.lastMessage}</p>}
                          </div>
                        </Link>
                        <ConversationMenu conversation={conversation} onChange={load} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : (
            <div className="px-6 py-16 text-center">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-[2rem] bg-[var(--bg)] text-[var(--brand)]"><MessageSquarePlus className="h-7 w-7" aria-hidden="true" /></div>
              <h2 className="mt-5 text-base font-semibold text-[var(--ink)]">{query ? "No matching conversations" : "No conversations yet"}</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[var(--ink-muted)]">{query ? "Try a different search." : "Ask TaskFlow AI a question and your history will appear here."}</p>
              <Link href="/chat" className="mt-6 inline-flex rounded-2xl bg-[var(--brand)] px-5 py-3 text-sm font-bold text-white">Start a new chat</Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function dayKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Previous";
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfThat = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((startOfToday.getTime() - startOfThat.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return "Previous";
}

function groupConversations(conversations: ConversationSummary[]): Array<{ label: string; items: ConversationSummary[] }> {
  const order = ["Today", "Yesterday", "Previous"];
  const groups = new Map<string, ConversationSummary[]>();
  for (const conversation of conversations) {
    const label = dayKey(conversation.updatedAt);
    const list = groups.get(label) ?? [];
    list.push(conversation);
    groups.set(label, list);
  }
  return order.filter((label) => groups.has(label)).map((label) => ({ label, items: groups.get(label)! }));
}

function relativeTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

