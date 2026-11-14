"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowDown, Copy, Mic, MicOff, Send } from "lucide-react";
import type { AgentUser, ChatMessage, Conversation } from "@/types/agent";
import { renderToolResult } from "@/components/agent/tool-renderers";
import MarkdownMessage from "@/components/chat/MarkdownMessage";
import ConversationMenu from "@/components/history/ConversationMenu";

import AppHeader from "@/components/layout/AppHeader";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { cn } from "@/lib/utils";
import { suggestionsForRole } from "@/lib/agent/suggestions";
import { unlockAudio, playSound } from "@/lib/sound";
import { normalizeResponse } from "@/lib/agent/normalize";
import CommandMenu, { type CommandMenuItem } from "./CommandMenu";

type ChatClientProps = {
  user: AgentUser;
  conversationId: string | null;
  initialPrompt?: string | null;
};

const SCROLL_BOTTOM_THRESHOLD = 120;

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
  const reducedMotion = useReducedMotion();
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId);
  const [title, setTitle] = useState(initialConversationId ? "Conversation" : "New chat");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(Boolean(initialConversationId));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandItems, setCommandItems] = useState<CommandMenuItem[]>([]);
  const [employees, setEmployees] = useState<Array<{ employeeId: string; fullName: string }>>([]);
  const abortRef = useRef<AbortController | null>(null);
  const announcedRef = useRef<Set<string>>(new Set());
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
        setMessages(
          (result.conversation.messages ?? []).map((m) => ({
            id: String(m.id ?? ""),
            role: m.role === "assistant" ? "assistant" : "user",
            parts: normalizeResponse(m),
            createdAt: typeof m.createdAt === "number" ? m.createdAt : Date.now(),
          })),
        );
        setTitle(result.conversation.title);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [initialConversationId]);

  const isNearBottom = useCallback(() => {
    const el = messagesRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight <= SCROLL_BOTTOM_THRESHOLD;
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = messagesRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    if (isNearBottom()) {
      scrollToBottom();
    }
  }, [messages.length, sending, isNearBottom, scrollToBottom]);

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    const onScroll = () => {
      setShowScrollButton(!isNearBottom());
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [isNearBottom]);

  const sendMessage = useCallback(async (rawText: string) => {
    const text = rawText.trim();
    if (!text || sending) return;
    unlockAudio();
    playSound("send");
    setActionError(null);
    const tempId = `temp-${Date.now()}`;
    const optimistic: ChatMessage = { id: tempId, role: "user", parts: [{ type: "text", text }], createdAt: Date.now() };
    setMessages((current) => [...current, optimistic]);
    setInput("");
    setSending(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: conversationId ?? undefined, message: text }),
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok && response.status !== 503 && response.status !== 429) {
        if (response.status === 401) router.replace("/login");
        throw new Error("Something went wrong. Please try again.");
      }
      if (data.conversationId && !conversationId) {
        setConversationId(data.conversationId);
        window.history.replaceState(null, "", `/chat/${data.conversationId}`);
      }
      if (data.title) setTitle(data.title);
      if (data.message) {
        const normalized = {
          id: String(data.message.id ?? `${tempId}-assistant`),
          role: data.message.role === "assistant" ? "assistant" : "user",
          parts: normalizeResponse(data.message),
          createdAt: typeof data.message.createdAt === "number" ? data.message.createdAt : Date.now(),
        } as ChatMessage;
        setMessages((current) => [...current.filter((message) => message.id !== tempId), { ...optimistic, id: `${tempId}-synced` }, normalized]);
        if (normalized.role === "assistant" && !announcedRef.current.has(normalized.id)) {
          announcedRef.current.add(normalized.id);
          playSound("receive");
        }
      } else {
        setMessages((current) => current.filter((message) => message.id !== tempId).concat(optimistic));
      }
      if (!response.ok && data.error) setActionError("Something went wrong. Please try again.");
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") {
        setActionError(null);
        return;
      }
      console.error(reason);
      setActionError("Something went wrong. Please try again.");
      playSound("error");
      setMessages((current) => current.filter((message) => message.id !== tempId).concat(optimistic));
    } finally {
      abortRef.current = null;
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

  useEffect(() => {
    if (user.role !== "admin") return;
    fetch("/api/employees", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setEmployees(data.employees ?? []))
      .catch(() => undefined);
  }, [user.role]);

  const suggestions = useMemo(() => suggestionsForRole(user.role), [user.role]);

  function stopSending() {
    abortRef.current?.abort();
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendMessage(input);
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  }

  if (loading) {
    return (
      <div className="flex h-dvh flex-col"><ChatSkeleton /></div>
    );
  }

  if (loadError) {
    return (
      <div className="grid h-dvh place-items-center px-6 text-center">
        <div className="max-w-md rounded-2xl bg-[var(--surface)] p-6 shadow-sm">
          <p className="text-sm font-semibold text-rose-600">Unable to open conversation</p>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">{loadError}</p>
          <Link href="/chat" className="mt-5 inline-flex rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-bold text-white">New chat</Link>
        </div>
      </div>
    );
  }

  const isEmpty = messages.length === 0;

  const composer = (
    <form onSubmit={handleSubmit} className="bg-transparent px-4 py-3 pb-[max(env(safe-area-inset-bottom),12px)] sm:px-6">
      <div className="relative mx-auto flex w-full max-w-[760px] items-end gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-sm focus-within:border-[var(--brand)] focus-within:ring-2 focus-within:ring-[var(--brand)]/30">
        <CommandMenu
          open={commandOpen}
          items={commandItems}
          onSelect={(item) => {
            setInput(item.value);
            setCommandOpen(false);
          }}
          onClose={() => setCommandOpen(false)}
        />
        <button
          type="button"
          onClick={speech.listening ? speech.stop : speech.start}
          aria-label={speech.listening ? "Stop voice input" : "Start voice input"}
          aria-pressed={speech.listening}
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-full transition ${speech.listening ? "bg-rose-100 text-rose-600" : "text-[var(--ink-muted)] hover:bg-[var(--border)]"}`}
        >
          {speech.listening ? <MicOff className="h-5 w-5" aria-hidden="true" /> : <Mic className="h-5 w-5" aria-hidden="true" />}
        </button>
        <label className="sr-only" htmlFor="chat-input">Enter a prompt</label>
        <textarea
          ref={textareaRef}
          id="chat-input"
          rows={1}
          value={input}
          onChange={(event) => {
            const value = event.target.value;
            setInput(value);
            event.target.style.height = "auto";
            event.target.style.height = `${Math.min(event.target.scrollHeight, 180)}px`;
            if (user.role === "admin") {
              if (value.startsWith("@")) {
                const query = value.slice(1).toLowerCase();
                setCommandItems(
                  employees
                    .filter((employee) => employee.fullName.toLowerCase().includes(query) || employee.employeeId.toLowerCase().includes(query))
                    .slice(0, 8)
                    .map((employee) => ({ id: employee.employeeId, label: employee.fullName, value: employee.employeeId })),
                );
                setCommandOpen(true);
              } else if (value.startsWith("/")) {
                const commands = [
                  { id: "assign", label: "/assign", value: "Assign a task" },
                  { id: "report", label: "/report", value: "Generate this month's task report" },
                  { id: "overdue", label: "/overdue", value: "Which employees have overdue tasks?" },
                ].filter((command) => command.label.toLowerCase().includes(value.toLowerCase()));
                setCommandItems(commands);
                setCommandOpen(true);
              } else {
                setCommandOpen(false);
              }
            }
          }}
          onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendMessage(input); } }}
          placeholder={user.role === "admin" ? "Assign work, ask for reports…" : "Message TaskFlow…"}
          dir="auto"
          className="max-h-44 min-h-10 flex-1 resize-none bg-transparent py-2 text-sm leading-6 text-[var(--ink)] outline-none placeholder:text-[var(--ink-muted)]"
        />
        {sending ? (
          <button
            type="button"
            onClick={stopSending}
            aria-label="Stop generating"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--border)] text-[var(--ink-muted)] transition hover:bg-slate-300"
          >
            <span className="h-3 w-3 rounded-sm bg-current" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            aria-label="Send message"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--brand)] text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-[var(--border)] disabled:text-[var(--ink-muted)]"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      {speech.listening && <p className="mx-auto mt-1 max-w-[760px] px-2 text-[11px] font-medium text-[var(--brand)]">Listening…</p>}
      {speech.error && <p role="alert" className="mx-auto mt-1 max-w-[760px] px-2 text-[11px] text-rose-600">{speech.error}</p>}
      {actionError && <p role="alert" className="mx-auto mt-1 max-w-[760px] rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{actionError}</p>}
    </form>
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <AppHeader
        variant="main"
        title={messages.length === 0 ? "New chat" : title}
        right={
          conversationId && messages.length > 0 ? (
            <ConversationMenu
              conversation={{ id: conversationId, ownerId: "", title, createdAt: "", updatedAt: "", messageCount: messages.length }}
              onChange={() => router.push("/history")}
              align="right"
            />
          ) : null
        }
      />

      {isEmpty ? (
        <div className="flex flex-1 flex-col items-center justify-center px-4 sm:px-6">
          <div className="w-full max-w-[760px] text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink)] text-center text-balance">What do you want to get done?</h1>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">Hi, {user.name.split(" ")[0]}</p>
            <div className="mt-6">{composer}</div>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion.id}
                  type="button"
                  onClick={() => sendMessage(suggestion.prompt)}
                  className="h-9 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3.5 text-sm text-[var(--ink)] transition hover:border-[var(--border)] hover:bg-[var(--bg)]"
                >
                  {suggestion.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div ref={messagesRef} className="relative flex-1 overflow-y-auto px-4 py-6 sm:px-6">
            <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6">
              {messages.map((message, index) => {
                const isUser = message.role === "user";
                const previous = messages[index - 1];
                const showDivider = Boolean(previous) && message.createdAt - (previous?.createdAt ?? 0) > 30 * 60 * 1000;

                return (
                  <div key={message.id}>
                    {showDivider && (
                      <div className="mb-6 text-center text-xs text-[var(--ink-muted)]" title={new Date(message.createdAt).toLocaleString()}>
                        {new Date(message.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </div>
                    )}
                    <motion.div
                      initial={reducedMotion ? false : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18, ease: "easeOut" }}
                      className={cn("group relative", isUser ? "ml-auto max-w-[85%]" : "w-full")}
                      title={new Date(message.createdAt).toLocaleString()}
                    >
                      {isUser ? (
                        <div className="py-1 pl-8 pr-1 text-right">
                          <p className="whitespace-pre-wrap font-medium text-[var(--ink)]" dir="auto">
                            {(message.parts ?? []).filter((part) => part.type === "text").map((part) => (part as { text: string }).text).join("\n")}
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {(message.parts ?? []).map((part, partIndex) => {
                            if (part.type === "text") {
                              return <MarkdownMessage key={partIndex} content={part.text} />;
                            }
                            if (part.type === "tool-result") {
                              return <div key={part.id}>{renderToolResult(part, undefined, conversationId)}</div>;
                            }
                            return null;
                          })}
                        </div>
                      )}

                      <div
                        className={cn(
                          "mt-1 flex items-center gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100",
                          isUser ? "justify-end" : "justify-start",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => copyText((message.parts ?? []).filter((part) => part.type === "text").map((part) => (part as { text: string }).text).join("\n"))}
                          aria-label="Copy message"
                          className="grid h-7 w-7 place-items-center rounded-lg text-[var(--ink-muted)] hover:bg-[var(--border)] hover:text-[var(--ink-muted)]"
                        >
                          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        {isUser && (
                          <button
                            type="button"
                            onClick={() => sendMessage((message.parts ?? []).filter((part) => part.type === "text").map((part) => (part as { text: string }).text).join("\n"))}
                            aria-label="Retry message"
                            className="grid h-7 w-7 place-items-center rounded-lg text-[var(--ink-muted)] hover:bg-[var(--border)] hover:text-[var(--ink-muted)]"
                          >
                            <Send className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        )}
                      </div>


                    </motion.div>
                  </div>
                );
              })}
              {sending && <TypingIndicator />}
            </div>

            {showScrollButton && (
              <button
                type="button"
                onClick={scrollToBottom}
                aria-label="Scroll to latest"
                className="fixed bottom-24 right-6 grid h-10 w-10 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--ink-muted)] shadow-md transition hover:bg-[var(--bg)]"
              >
                <ArrowDown className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
          <div className="relative before:pointer-events-none before:absolute before:-top-4 before:left-0 before:right-0 before:h-4 before:bg-gradient-to-b before:from-[var(--bg)] before:to-transparent">
            {composer}
          </div>
        </>
      )}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1 rounded-2xl border border-[var(--border)]/80 bg-[var(--surface)] px-4 py-3 shadow-sm" aria-label="TaskFlow AI is typing">
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
      <div className="border-b border-[var(--border)]/80 bg-[var(--surface)]/70 p-4"><div className="h-11 w-56 animate-pulse rounded-2xl bg-[var(--border)]" /></div>
      <div className="flex-1 space-y-4 p-6"><div className="ml-auto h-16 w-2/3 animate-pulse rounded-3xl bg-[var(--border)]" /><div className="h-24 w-3/4 animate-pulse rounded-3xl bg-[var(--border)]" /><div className="ml-auto h-16 w-1/2 animate-pulse rounded-3xl bg-[var(--border)]" /></div>
      <div className="border-t border-[var(--border)]/80 bg-[var(--surface)]/70 p-4"><div className="h-14 animate-pulse rounded-2xl bg-[var(--border)]" /></div>
    </div>
  );
}
