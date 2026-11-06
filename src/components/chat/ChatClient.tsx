"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, Mic, MoreHorizontal, Send, Sparkles } from "lucide-react";
import type { AgentUser, ChatMessage, Conversation } from "@/types/agent";
import MessageCards from "@/components/chat/Cards";
import ConversationMenu from "@/components/history/ConversationMenu";
import { MobileMenuButton } from "@/components/layout/AppShell";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { hasAnyPermission, hasPermission } from "@/lib/permissions";
import { cn, initials } from "@/lib/utils";

type ChatClientProps = {
  user: AgentUser;
  conversationId: string | null;
  initialPrompt?: string | null;
};

type ConversationFetchResult = { conversation?: Conversation; error?: string };

async function fetchConversation(id: string): Promise<ConversationFetchResult> {
  try {
    const response = await fetch(`/api/conversations/${encodeURIComponent(id)}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { error: data.error || "Conversation not found" };
    return { conversation: data.conversation };
  } catch {
    return { error: "Conversation not found" };
  }
}

export default function ChatClient({ user, conversationId: initialConversationId, initialPrompt }: ChatClientProps) {
  const router = useRouter();
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId);
  const [title, setTitle] = useState(initialConversationId ? "Conversation" : "New chat");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(Boolean(initialConversationId));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sentInitialRef = useRef(false);

  const appendSpeech = useCallback((text: string) => {
    setInput((current) => (current ? `${current} ${text}` : text));
    textareaRef.current?.focus();
  }, []);
  const speech = useSpeechRecognition(appendSpeech);

  useEffect(() => {
    if (!initialConversationId) return;
    let cancelled = false;
    fetchConversation(initialConversationId).then((result) => {
      if (cancelled) return;
      if (result.error) {
        setLoadError(result.error);
      } else if (result.conversation) {
        setMessages(result.conversation.messages);
        setTitle(result.conversation.title);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [initialConversationId]);

  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, sending]);

  const sendMessage = useCallback(async (rawText: string) => {
    const text = rawText.trim();
    if (!text || sending) return;
    setActionError(null);
    const tempId = `temp-${Date.now()}`;
    const optimistic: ChatMessage = { id: tempId, role: "user", content: text, createdAt: new Date().toISOString() };
    setMessages((current) => [...current, optimistic]);
    setInput("");
    setSending(true);
    try {
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: conversationId ?? undefined, message: text }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok && response.status !== 503 && response.status !== 429) {
        if (response.status === 401) router.replace("/login");
        throw new Error(data.error || "Unable to send message");
      }
      if (data.conversationId && !conversationId) {
        setConversationId(data.conversationId);
        window.history.replaceState(null, "", `/chat/${data.conversationId}`);
      }
      if (data.title) setTitle(data.title);
      if (data.message) {
        setMessages((current) => [...current.filter((message) => message.id !== tempId), { ...optimistic, id: `${tempId}-synced` }, data.message]);
      } else {
        setMessages((current) => current.filter((message) => message.id !== tempId).concat(optimistic));
      }
      if (!response.ok && data.error) setActionError(data.error);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "Unable to send message");
      setMessages((current) => current.filter((message) => message.id !== tempId).concat(optimistic));
    } finally {
      setSending(false);
    }
  }, [conversationId, router, sending]);

  useEffect(() => {
    if (initialPrompt && !sentInitialRef.current) {
      sentInitialRef.current = true;
      setInput(initialPrompt);
      sendMessage(initialPrompt);
    }
  }, [initialPrompt, sendMessage]);

  const suggestions = useMemo(() => {
    const items: string[] = [];
    if (hasAnyPermission(user, ["TASKS_VIEW_MY", "TASKS_VIEW_DEPARTMENT", "TASKS_VIEW_ALL"])) items.push("Show my tasks");
    if (hasPermission(user, "TASKS_CREATE")) items.push(user.role === "admin" ? "Assign a high-priority task to " : "Create a task to ");
    if (hasAnyPermission(user, ["PERFORMANCE_VIEW_MY", "PERFORMANCE_VIEW_DEPARTMENT", "PERFORMANCE_VIEW_ALL"])) items.push("Show performance summary");
    if (hasAnyPermission(user, ["TASKS_VIEW_MY", "TASKS_VIEW_DEPARTMENT", "TASKS_VIEW_ALL"])) items.push("What tasks are overdue?");
    return items.slice(0, 3);
  }, [user]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendMessage(input);
  }

  if (loading) {
    return (
      <div className="flex h-screen flex-col"><ChatSkeleton /></div>
    );
  }

  if (loadError) {
    return (
      <div className="grid h-screen place-items-center px-6 text-center">
        <div className="max-w-md rounded-3xl bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold text-rose-600">Unable to open conversation</p>
          <p className="mt-2 text-sm text-muted">{loadError}</p>
          <Link href="/history" className="mt-5 inline-flex rounded-2xl bg-primary px-4 py-2 text-sm font-bold text-white">Back to history</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="z-10 border-b border-white/70 bg-white/80 px-4 py-3 backdrop-blur-xl sm:px-6">
        <div className="mx-auto flex max-w-4xl items-center gap-2">
          <MobileMenuButton />
          <button type="button" onClick={() => router.back()} aria-label="Go back" className="grid h-11 w-11 place-items-center rounded-2xl text-slate-600 transition hover:bg-slate-100">
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-navy text-[11px] font-black text-cyan">AI</div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-navy">TaskFlow AI</p>
              <p className="truncate text-[11px] text-muted">{title}</p>
            </div>
          </div>
          <div className="relative">
            <button type="button" aria-label="Conversation menu" className="grid h-11 w-11 place-items-center rounded-2xl text-slate-600 transition hover:bg-slate-100">
              <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
            </button>
            <div className="absolute right-0 top-12">
              {conversationId && messages.length > 0 && (
                <ConversationMenu
                  conversation={{ id: conversationId, ownerId: "", title, createdAt: "", updatedAt: "", messageCount: messages.length }}
                  onChange={() => router.push("/history")}
                />
              )}
            </div>
          </div>
        </div>
      </header>

      <div ref={messagesRef} className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto flex max-w-4xl flex-col gap-5">
          {messages.length === 0 ? (
            <div className="mx-auto mt-10 max-w-2xl text-center">
              <div className="mx-auto grid h-20 w-20 place-items-center rounded-[2rem] bg-navy text-cyan shadow-[0_20px_40px_rgba(7,20,38,0.15)]"><Sparkles className="h-8 w-8" aria-hidden="true" /></div>
              <h1 className="mt-6 text-2xl font-semibold tracking-tight text-navy sm:text-4xl">Ask TaskFlow AI</h1>
              <p className="mt-3 text-sm leading-6 text-muted">Live answers from your workspace — tasks, assignments, performance and reports.</p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {suggestions.map((suggestion) => (
                  <button key={suggestion} type="button" onClick={() => sendMessage(suggestion)} className="rounded-full border border-line bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-primary hover:text-primary">
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : messages.map((message) => {
            const isUser = message.role === "user";
            return (
              <div key={message.id} className={cn("flex max-w-full gap-2 sm:gap-3", isUser && "flex-row-reverse")}>
                {isUser ? (
                  <div className="grid h-8 w-8 shrink-0 place-items-center self-end rounded-full bg-primary text-[10px] font-bold text-white sm:h-9 sm:w-9">{initials(user.name)}</div>
                ) : (
                  <div className="grid h-8 w-8 shrink-0 place-items-center self-end rounded-xl bg-navy text-[9px] font-black text-cyan sm:h-9 sm:w-9">AI</div>
                )}
                <div className={cn("max-w-[86%] sm:max-w-[76%]", isUser && "flex flex-col items-end")}>
                  <div className={cn(
                    "rounded-3xl px-4 py-3 text-sm leading-6 shadow-sm",
                    isUser ? "rounded-br-md bg-primary text-white" : "rounded-bl-md border border-line/70 bg-white text-navy",
                  )}>
                    <p className="whitespace-pre-wrap">{message.content}</p>
                    {message.cards && message.cards.length > 0 && <MessageCards cards={message.cards} />}
                  </div>
                  <p className="mt-1 px-2 text-[10px] text-muted">{new Date(message.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</p>
                </div>
              </div>
            );
          })}
          {sending && <TypingIndicator />}
        </div>
      </div>

      {actionError && (
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-6"><p role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">{actionError}</p></div>
      )}

      <form onSubmit={handleSubmit} className="border-t border-white/70 bg-white/90 px-3 py-3 backdrop-blur-xl sm:px-6 sm:py-4">
        <div className="mx-auto flex max-w-4xl items-end gap-2 rounded-[2rem] border border-line bg-[#F7FBFE] p-2 focus-within:border-primary focus-within:bg-white focus-within:ring-4 focus-within:ring-sky-100">
          <button
            type="button"
            onClick={speech.listening ? speech.stop : speech.start}
            aria-label={speech.listening ? "Stop listening" : "Use microphone"}
            aria-pressed={speech.listening}
            className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-full transition", speech.listening ? "bg-rose-100 text-rose-600" : "text-muted hover:bg-slate-100")}
          >
            <Mic className="h-5 w-5" aria-hidden="true" />
          </button>
          <label className="sr-only" htmlFor="chat-input">Enter a prompt</label>
          <textarea
            ref={textareaRef}
            id="chat-input"
            rows={1}
            value={input}
            onChange={(event) => { setInput(event.target.value); event.target.style.height = "auto"; event.target.style.height = `${Math.min(event.target.scrollHeight, 180)}px`; }}
            onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendMessage(input); } }}
            placeholder="Enter a prompt here..."
            className="max-h-44 min-h-11 flex-1 resize-none bg-transparent py-2.5 text-sm leading-6 text-navy outline-none placeholder:text-slate-400"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            aria-label="Send message"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-white shadow-lg shadow-sky-200 transition hover:bg-[#0670e8] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Send className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
        {speech.listening && <p className="mx-auto mt-1 max-w-4xl px-2 text-[11px] font-medium text-primary">Listening…</p>}
        {speech.error && <p role="alert" className="mx-auto mt-1 max-w-4xl px-2 text-[11px] text-rose-600">{speech.error}</p>}
      </form>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-2">
      <div className="grid h-8 w-8 place-items-center rounded-xl bg-navy text-[9px] font-black text-cyan">AI</div>
      <div className="flex items-center gap-1 rounded-3xl rounded-bl-md border border-line/70 bg-white px-4 py-3 shadow-sm" aria-label="TaskFlow AI is typing">
        {[0, 1, 2].map((index) => (
          <motion.span
            key={index}
            className="h-2 w-2 rounded-full bg-slate-300"
            animate={{ y: [0, -4, 0], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 0.9, repeat: Infinity, delay: index * 0.15 }}
          />
        ))}
      </div>
    </div>
  );
}

function ChatSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line bg-white/70 p-4"><div className="h-11 w-56 animate-pulse rounded-2xl bg-slate-100" /></div>
      <div className="flex-1 space-y-4 p-6"><div className="ml-auto h-16 w-2/3 animate-pulse rounded-3xl bg-slate-100" /><div className="h-24 w-3/4 animate-pulse rounded-3xl bg-slate-100" /><div className="ml-auto h-16 w-1/2 animate-pulse rounded-3xl bg-slate-100" /></div>
      <div className="border-t border-line bg-white/70 p-4"><div className="h-14 animate-pulse rounded-[2rem] bg-slate-100" /></div>
    </div>
  );
}
