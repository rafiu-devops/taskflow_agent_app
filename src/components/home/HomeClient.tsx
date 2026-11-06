"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  ListChecks,
  Mic,
  Send,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";
import type { AgentUser, ConversationSummary } from "@/types/agent";
import { hasAnyPermission, hasPermission } from "@/lib/permissions";
import { initials } from "@/lib/utils";
import { MobileMenuButton } from "@/components/layout/AppShell";
import ConversationMenu from "@/components/history/ConversationMenu";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";

type ConversationFetchResult = { conversations?: ConversationSummary[]; error?: string };

async function fetchConversations(): Promise<ConversationFetchResult> {
  try {
    const response = await fetch("/api/conversations", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { error: data.error || "Unable to load recent history" };
    return { conversations: data.conversations ?? [] };
  } catch {
    return { error: "Unable to load recent history" };
  }
}

export default function HomeClient({ user }: { user: AgentUser }) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const submitPrompt = useCallback((text: string) => {
    const cleaned = text.trim();
    if (!cleaned) return;
    router.push(`/chat?prompt=${encodeURIComponent(cleaned)}`);
  }, [router]);

  const appendSpeech = useCallback((text: string) => {
    setPrompt((current) => (current ? `${current} ${text}` : text));
  }, []);
  const speech = useSpeechRecognition(appendSpeech);

  const applyConversationResult = useCallback((result: ConversationFetchResult) => {
    if (result.error) {
      setHistoryError(result.error);
    } else {
      setConversations(result.conversations ?? []);
      setHistoryError(null);
    }
  }, []);

  const loadConversations = useCallback(async () => {
    applyConversationResult(await fetchConversations());
    setHistoryLoading(false);
  }, [applyConversationResult]);

  useEffect(() => {
    let cancelled = false;
    fetchConversations()
      .then((result) => {
        if (cancelled) return;
        applyConversationResult(result);
        setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applyConversationResult]);

  const quickActions = useMemo(() => {
    const actions: Array<{ label: string; prompt: string; show: boolean }> = [
      { label: "My Tasks", prompt: "Show my tasks", show: hasAnyPermission(user, ["TASKS_VIEW_MY", "TASKS_VIEW_DEPARTMENT", "TASKS_VIEW_ALL"]) },
      { label: "Assign Task", prompt: "Assign a high-priority task to ", show: hasPermission(user, "TASKS_CREATE") },
      { label: "Performance", prompt: user.role === "admin" ? "Show organization performance summary" : "Show my performance", show: hasAnyPermission(user, ["PERFORMANCE_VIEW_MY", "PERFORMANCE_VIEW_DEPARTMENT", "PERFORMANCE_VIEW_ALL"]) },
      { label: "Reports", prompt: "Generate this month's task report", show: hasAnyPermission(user, ["REPORTS_VIEW_DASHBOARD", "REPORTS_VIEW_DEPARTMENT", "REPORTS_VIEW_ALL", "DASHBOARD_VIEW_PERSONAL"]) },
    ];
    return actions.filter((action) => action.show).slice(0, 4);
  }, [user]);

  const featureCards = useMemo(() => {
    if (user.role === "admin") {
      return [
        { icon: ClipboardList, title: "Task Management", desc: "Assign, prioritize and track work across teams.", prompt: "Show all pending tasks", show: true },
        { icon: BarChart3, title: "Employee Performance", desc: "Completion rates from live workbook data.", prompt: "Which employees have the highest completion rate?", show: true },
        { icon: ListChecks, title: "Pending & Overdue", desc: "Find blocked and overdue work fast.", prompt: "Show overdue tasks", show: true },
        { icon: Users, title: "Department Insights", desc: "See workload distribution by department.", prompt: "Show task distribution by department", show: hasPermission(user, "DEPARTMENTS_VIEW") },
      ].filter((card) => card.show);
    }
    return [
      { icon: ClipboardList, title: "My Tasks", desc: "Your assigned work, sorted by priority.", prompt: "Show my tasks for today", show: hasAnyPermission(user, ["TASKS_VIEW_MY", "TASKS_VIEW_DEPARTMENT", "TASKS_VIEW_ALL"]) },
      { icon: BarChart3, title: "My Performance", desc: "Your completion trend and summaries.", prompt: "Show my weekly performance", show: hasPermission(user, "PERFORMANCE_VIEW_MY") },
      { icon: ListChecks, title: "Overdue Work", desc: "See what needs attention now.", prompt: "What tasks are overdue?", show: hasAnyPermission(user, ["TASKS_VIEW_MY", "TASKS_VIEW_DEPARTMENT", "TASKS_VIEW_ALL"]) },
      { icon: CheckCircle2, title: "Update Progress", desc: "Move a task forward from chat.", prompt: "Update my task progress to 70 percent", show: hasPermission(user, "TASKS_UPDATE_PROGRESS") },
    ].filter((card) => card.show);
  }, [user]);

  return (
    <div className="min-h-screen px-4 pb-10 pt-4 sm:px-6 lg:px-8">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <MobileMenuButton />
          <div className="lg:hidden">
            <p className="text-sm font-bold leading-5 text-navy">TaskFlow AI</p>
            <p className="text-[11px] text-muted">Operations assistant</p>
          </div>
        </div>
        <Link href="/settings" aria-label="Open settings" className="flex items-center gap-2 rounded-2xl bg-white p-1.5 pr-3 shadow-sm transition hover:bg-slate-50">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-navy text-xs font-bold text-cyan">{initials(user.name)}</div>
          <div className="hidden text-left sm:block">
            <p className="max-w-40 truncate text-xs font-bold text-navy">{user.name}</p>
            <p className="text-[10px] capitalize text-muted">{user.role}</p>
          </div>
          <Settings className="h-4 w-4 text-muted" aria-hidden="true" />
        </Link>
      </header>

      <main className="mx-auto mt-6 grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="overflow-hidden rounded-[2.5rem] bg-white p-6 shadow-[0_24px_60px_rgba(7,20,38,0.10)] sm:p-8"
          >
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              <Sparkles className="h-4 w-4" aria-hidden="true" /> TaskFlow Agent
            </div>
            <h1 className="mt-3 text-3xl font-semibold leading-[1.08] tracking-tight text-navy sm:text-5xl">Talk with TaskFlow</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted">Assign work, ask for reports or check your tasks — in plain language.</p>

            <form onSubmit={(event) => { event.preventDefault(); submitPrompt(prompt); }} className="mt-6">
              <div className="flex items-center gap-2 rounded-[2rem] border border-line bg-[#F7FBFE] p-2 transition focus-within:border-primary focus-within:bg-white focus-within:ring-4 focus-within:ring-sky-100">
                <button
                  type="button"
                  onClick={speech.listening ? speech.stop : speech.start}
                  aria-label={speech.listening ? "Stop listening" : "Use microphone"}
                  aria-pressed={speech.listening}
                  className={`grid h-12 w-12 shrink-0 place-items-center rounded-full transition ${speech.listening ? "bg-rose-100 text-rose-600" : "text-muted hover:bg-slate-100"}`}
                >
                  <Mic className="h-5 w-5" aria-hidden="true" />
                </button>
                <label className="sr-only" htmlFor="home-prompt">Write your prompt</label>
                <input
                  id="home-prompt"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="Write your prompt..."
                  className="min-w-0 flex-1 bg-transparent text-sm text-navy outline-none placeholder:text-slate-400 sm:text-base"
                />
                <button type="submit" aria-label="Send prompt" className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary text-white shadow-lg shadow-sky-200 transition hover:bg-[#0670e8]">
                  <Send className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              {speech.listening && <p className="mt-2 text-xs font-medium text-primary">Listening… speak now.</p>}
              {speech.error && <p role="alert" className="mt-2 text-xs text-rose-600">{speech.error}</p>}
            </form>

            <div className="mt-6 flex flex-wrap gap-2">
              {quickActions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => submitPrompt(action.prompt)}
                  className="rounded-full border border-line bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-primary hover:text-primary"
                >
                  {action.label}
                </button>
              ))}
              {!quickActions.length && (
                <span className="rounded-full border border-line bg-slate-50 px-4 py-2 text-xs text-muted">Your permissions don&apos;t enable quick actions yet.</span>
              )}
            </div>
          </motion.div>

          <section>
            <div className="mb-3 flex items-end justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Explore</p>
                <h2 className="mt-1 text-lg font-semibold text-navy">Features for you</h2>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {featureCards.map((card) => {
                const Icon = card.icon;
                return (
                  <button
                    key={card.title}
                    type="button"
                    onClick={() => submitPrompt(card.prompt)}
                    className="group rounded-3xl bg-navy p-5 text-left text-white transition hover:-translate-y-0.5 hover:bg-navy-soft"
                  >
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-cyan">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <h3 className="mt-4 text-base font-semibold">{card.title}</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-300">{card.desc}</p>
                    <span className="mt-4 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-cyan">Open <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></span>
                  </button>
                );
              })}
              {!featureCards.length && (
                <div className="rounded-3xl border border-dashed border-line bg-white/60 p-6 text-sm text-muted">No features are enabled for your account yet. Ask your administrator for access.</div>
              )}
            </div>
          </section>
        </section>

        <aside className="h-fit overflow-hidden rounded-[2rem] border border-white/70 bg-white/80 shadow-[0_24px_60px_rgba(7,20,38,0.08)] backdrop-blur">
          <div className="flex items-center justify-between border-b border-line/70 p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Recent</p>
              <h2 className="mt-1 text-base font-semibold text-navy">Conversation history</h2>
            </div>
            <Link href="/history" className="text-xs font-bold text-primary hover:underline">See all</Link>
          </div>
          <div className="p-3">
            {historyError && <p role="alert" className="rounded-2xl bg-rose-50 p-3 text-xs text-rose-700">{historyError}</p>}
            {historyLoading ? (
              <div className="space-y-2 p-2">{Array.from({ length: 4 }, (_, i) => <div key={i} className="h-14 animate-pulse rounded-2xl bg-slate-100" />)}</div>
            ) : conversations.length ? (
              <ul className="divide-y divide-line/70">
                {conversations.slice(0, 4).map((conversation) => (
                  <li key={conversation.id} className="flex items-center gap-2 py-2">
                    <Link href={`/chat/${conversation.id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-2 transition hover:bg-slate-50">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary">TF</div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-navy">{conversation.title}</p>
                        <p className="mt-0.5 text-[11px] text-muted">{conversation.messageCount} message{conversation.messageCount === 1 ? "" : "s"}</p>
                      </div>
                    </Link>
                    <ConversationMenu conversation={conversation} onChange={loadConversations} />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-5 text-center">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-sm font-bold text-slate-400">0</div>
                <p className="mt-3 text-sm font-semibold text-navy">No conversations yet</p>
                <p className="mt-1 text-xs leading-5 text-muted">Ask your first question to start building history.</p>
              </div>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}
