"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { History, Info, MessageSquarePlus, Search, Settings } from "lucide-react";
import type { AgentUser, ConversationSummary } from "@/types/agent";
import { cn } from "@/lib/utils";
import BrandLogo from "@/components/layout/BrandLogo";
import UserProfile from "@/components/layout/UserProfile";
import ConversationList, {
  ConversationListEmpty,
} from "@/components/history/ConversationList";
import AboutDialog from "@/components/layout/AboutDialog";

type AppSidebarProps = {
  user: AgentUser;
  /** Closes the mobile drawer after a navigation. */
  onNavigate?: () => void;
  /** Rendered above the profile block in the drawer. */
  closeControl?: React.ReactNode;
};

const NAV = [
  { id: "history", label: "Chat History", href: "/history", icon: History, match: (p: string) => p.startsWith("/history") },
  { id: "settings", label: "Settings", href: "/settings", icon: Settings, match: (p: string) => p.startsWith("/settings") },
] as const;

/**
 * Fixed navy navigation column shared by the desktop rail and the mobile
 * drawer so both always show identical content and states.
 */
export default function AppSidebar({ user, onNavigate, closeControl }: AppSidebarProps) {
  const pathname = usePathname();
  const [search, setSearch] = useState("");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<{
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: string }>;
  } | null>(null);

  const loadConversations = useCallback(async () => {
    try {
      const response = await fetch("/api/conversations", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (response.ok) setConversations(data.conversations ?? []);
    } catch {
      // History is non-critical; keep whatever we already have.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/conversations", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled) setConversations(data.conversations ?? []);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(
        event as unknown as { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> },
      );
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return conversations;
    return conversations.filter((item) => item.title.toLowerCase().includes(query));
  }, [conversations, search]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <div className="flex shrink-0 items-center gap-2">
        <Link
          href="/chat"
          onClick={onNavigate}
          className="min-w-0 flex-1 rounded-xl transition hover:opacity-90"
          aria-label="TaskFlow AI home"
        >
          <BrandLogo tone="on-dark" />
        </Link>
        {closeControl}
      </div>

      <Link
        href="/chat"
        onClick={onNavigate}
        className="tf-btn-primary h-11 shrink-0 px-4 text-sm shadow-[0_10px_24px_rgba(23,101,255,0.4)]"
      >
        <MessageSquarePlus className="h-4.5 w-4.5" aria-hidden="true" />
        New Chat
      </Link>

      <nav aria-label="Primary" className="shrink-0 space-y-1">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = item.match(pathname);
          return (
            <Link
              key={item.id}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-10 items-center gap-3 rounded-xl px-3 text-[13.5px] font-medium transition",
                active
                  ? "bg-white/12 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)]"
                  : "text-white/65 hover:bg-white/8 hover:text-white",
              )}
            >
              <Icon className="h-4.5 w-4.5 shrink-0" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}

        <button
          type="button"
          onClick={() => setAboutOpen(true)}
          className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-[13.5px] font-medium text-white/65 transition hover:bg-white/8 hover:text-white"
        >
          <Info className="h-4.5 w-4.5 shrink-0" aria-hidden="true" />
          About
        </button>
      </nav>

      <div className="relative shrink-0">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45"
          aria-hidden="true"
        />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search chats"
          aria-label="Search conversations"
          className="h-9 w-full rounded-full border border-white/10 bg-white/8 pl-9 pr-3 text-[13px] text-white outline-none transition placeholder:text-white/40 focus:border-brand-bright focus:bg-white/12"
        />
      </div>

      <div className="tf-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
        {loading ? (
          <div className="space-y-2" aria-hidden="true">
            {Array.from({ length: 4 }, (_, index) => (
              <div
                key={index}
                className="h-12 animate-pulse rounded-xl bg-white/8"
                style={{ animationDelay: `${index * 90}ms` }}
              />
            ))}
          </div>
        ) : (
          <ConversationList
            conversations={filtered}
            variant="sidebar"
            onChanged={loadConversations}
            onOpen={onNavigate}
            empty={
              search ? (
                <p className="px-1 py-3 text-[12px] text-white/50">No chats match “{search}”.</p>
              ) : (
                <ConversationListEmpty variant="sidebar" />
              )
            }
          />
        )}

        {installPrompt && (
          <div className="mt-4 border-t border-white/10 pt-3">
            <button
              type="button"
              onClick={async () => {
                await installPrompt.prompt();
                await installPrompt.userChoice.catch(() => undefined);
                setInstallPrompt(null);
              }}
              className="text-left text-[12px] font-semibold text-brand-bright transition hover:underline"
            >
              Install app
            </button>
          </div>
        )}
      </div>

      <div className="shrink-0">
        <UserProfile user={user} tone="dark" onNavigate={onNavigate} />
      </div>

      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </div>
  );
}
