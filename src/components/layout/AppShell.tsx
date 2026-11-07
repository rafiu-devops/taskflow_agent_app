"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { LogOut, Menu, MessageSquarePlus, Search, Settings, X } from "lucide-react";
import type { AgentUser, ConversationSummary } from "@/types/agent";
import { cn, initials } from "@/lib/utils";
import ConversationMenu from "@/components/history/ConversationMenu";

const AppShellContext = createContext<{ openSidebar: () => void } | null>(null);

export function useAppShell() {
  const context = useContext(AppShellContext);
  if (!context) throw new Error("useAppShell must be used inside AppShell");
  return context;
}

type GroupedConversations = { label: string; items: ConversationSummary[] }[];

function groupConversations(items: ConversationSummary[]): GroupedConversations {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 7);

  const groups: GroupedConversations = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Previous 7 days", items: [] },
  ];

  for (const item of items) {
    const date = new Date(item.updatedAt);
    if (date >= startOfToday) groups[0].items.push(item);
    else if (date >= startOfYesterday) groups[1].items.push(item);
    else if (date >= startOfWeek) groups[2].items.push(item);
  }

  return groups.filter((group) => group.items.length > 0);
}

export default function AppShell({ user, children }: { user: AgentUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [search, setSearch] = useState("");
  const [installPrompt, setInstallPrompt] = useState<null | { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/conversations", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return;
        setConversations(data.conversations ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as unknown as { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> });
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const context = useMemo(() => ({ openSidebar: () => setOpen(true) }), []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return conversations;
    return conversations.filter((item) => item.title.toLowerCase().includes(query));
  }, [conversations, search]);

  const grouped = useMemo(() => groupConversations(filtered), [filtered]);

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  const sidebar = (
    <div className="flex h-full flex-col gap-4">
      <Link href="/chat" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl p-2 hover:bg-[var(--bg)]">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--brand)] text-xs font-black text-white">TF</div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight text-[var(--ink)]">TaskFlow AI</p>
          <p className="truncate text-[11px] text-[var(--ink-muted)]">Operations assistant</p>
        </div>
      </Link>

      <Link
        href="/chat"
        onClick={() => setOpen(false)}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-4 text-sm font-semibold text-white transition hover:opacity-90"
      >
        <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
        New chat
      </Link>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-muted)]" aria-hidden="true" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search chats"
          className="h-9 w-full rounded-full border border-[var(--border)] bg-[var(--surface)] pl-9 pr-3 text-sm outline-none focus:border-[var(--brand)]"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="space-y-4">
          {grouped.map((group) => (
            <section key={group.label}>
              <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ink-muted)]">{group.label}</p>
              <div className="mt-1 space-y-0.5">
                {group.items.map((item) => {
                  const active = pathname === `/chat/${item.id}`;
                  return (
                    <div key={item.id} className="group flex items-center gap-1">
                      <Link
                        href={`/chat/${item.id}`}
                        onClick={() => setOpen(false)}
                        className={cn(
                          "min-w-0 flex-1 truncate rounded-xl px-3 py-2 text-sm transition",
                          active ? "bg-[var(--border)] font-medium text-[var(--ink)]" : "text-[var(--ink-muted)] hover:bg-[var(--bg)] hover:text-[var(--ink)]",
                        )}
                      >
                        {item.title}
                      </Link>
                      <div className="opacity-0 transition group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100">
                        <ConversationMenu conversation={item} onChange={() => fetch("/api/conversations").then((r) => r.json()).then((d) => setConversations(d.conversations ?? [])).catch(() => undefined)} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
          {!grouped.length && <p className="px-2 text-xs text-[var(--ink-muted)]">No conversations yet.</p>}
        </div>
      </div>

      {installPrompt && (
        <button
          type="button"
          onClick={async () => {
            await installPrompt.prompt();
            await installPrompt.userChoice.catch(() => undefined);
            setInstallPrompt(null);
          }}
          className="text-left text-xs font-medium text-[var(--brand)] hover:underline"
        >
          Install app
        </button>
      )}

      <div className="border-t border-[var(--border)] pt-3">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--border)] text-xs font-bold text-[var(--ink)]">{initials(user.name)}</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[var(--ink)]">{user.name}</p>
            <p className="truncate text-[11px] capitalize text-[var(--ink-muted)]">{user.role}</p>
          </div>
          <Link href="/settings" className="grid h-9 w-9 place-items-center rounded-xl text-[var(--ink-muted)] hover:bg-[var(--border)]" aria-label="Settings">
            <Settings className="h-4 w-4" aria-hidden="true" />
          </Link>
          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            aria-label="Sign out"
            className="grid h-9 w-9 place-items-center rounded-xl text-[var(--ink-muted)] hover:bg-[var(--border)] disabled:opacity-60"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <AppShellContext.Provider value={context}>
      <div className="min-h-screen bg-transparent text-foreground">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-[var(--border)]/80 bg-[var(--surface)] p-4 backdrop-blur-xl lg:block">
          {sidebar}
        </aside>

        {open && (
          <div className="fixed inset-0 z-40 lg:hidden" role="presentation">
            <button className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" aria-label="Close menu" onClick={() => setOpen(false)} />
            <aside ref={drawerRef} className="absolute inset-y-0 left-0 w-[min(20rem,88vw)] border-r border-[var(--border)]/80 bg-[var(--surface)] p-4 shadow-2xl">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--ink-muted)]">Menu</p>
                <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="rounded-xl p-2 text-[var(--ink-muted)] hover:bg-[var(--border)]">
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              {sidebar}
            </aside>
          </div>
        )}

        <div className="min-h-screen lg:pl-72">{children}</div>
      </div>
    </AppShellContext.Provider>
  );
}

export function MobileMenuButton({ className = "" }: { className?: string }) {
  const { openSidebar } = useAppShell();
  return (
    <button
      type="button"
      onClick={openSidebar}
      aria-label="Open menu"
      className={cn("grid h-11 w-11 place-items-center rounded-2xl bg-[var(--surface)] text-[var(--ink)] shadow-sm transition hover:bg-[var(--bg)] lg:hidden", className)}
    >
      <Menu className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}
