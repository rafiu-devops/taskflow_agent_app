"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, MessageSquarePlus } from "lucide-react";
import type { AgentUser, ChatMessage, Conversation } from "@/types/agent";
import ChatMessageRow, { TypingIndicator } from "@/components/chat/ChatMessage";
import ChatComposer from "@/components/chat/ChatComposer";
import ConversationHeader from "@/components/chat/ConversationHeader";
import MobileHeader from "@/components/layout/MobileHeader";
import WelcomeHero from "@/components/welcome/WelcomeHero";
import { useAppShell } from "@/components/layout/AppShell";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { unlockAudio, playSound } from "@/lib/sound";
import { normalizeResponse } from "@/lib/agent/normalize";
import CommandMenu, { type CommandMenuItem } from "./CommandMenu";

type ChatClientProps = {
  user: AgentUser;
  conversationId: string | null;
  initialPrompt?: string | null;
  aiConfigured?: boolean;
};

const SCROLL_BOTTOM_THRESHOLD = 120;
const TIMESTAMP_GAP = 30 * 60 * 1000;

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

export default function ChatClient({
  user: initialUser,
  conversationId: initialConversationId,
  initialPrompt,
  aiConfigured = true,
}: ChatClientProps) {
  const router = useRouter();
  // Live profile from the shell so a Settings display-name edit shows up here
  // without a reload; falls back to the server-rendered prop before hydration.
  const shell = useAppShell();
  const user = shell.user.email === initialUser.email ? shell.user : initialUser;

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
  const bottomRef = useRef<HTMLDivElement>(null);
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
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, []);

  useEffect(() => {
    if (isNearBottom()) scrollToBottom();
  }, [messages.length, sending, isNearBottom, scrollToBottom]);

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (isNearBottom()) scrollToBottom();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [isNearBottom, scrollToBottom]);

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    const onScroll = () => setShowScrollButton(!isNearBottom());
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [isNearBottom]);

  const sendMessage = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text || sending) return;
      unlockAudio();
      playSound("send");
      setActionError(null);

      const tempId = `temp-${Date.now()}`;
      const optimistic: ChatMessage = {
        id: tempId,
        role: "user",
        parts: [{ type: "text", text }],
        createdAt: Date.now(),
      };
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

        if (response.status === 401) {
          router.replace("/login");
          throw new Error("Your session expired. Please sign in again.");
        }
        if (data.conversationId && !conversationId) {
          setConversationId(data.conversationId);
          window.history.replaceState(null, "", `/chat/${data.conversationId}`);
        }
        if (data.title) setTitle(data.title);

        if (!response.ok) {
          const message =
            (typeof data.error === "string" && data.error.trim() && data.error) ||
            (typeof data.message === "string" && data.message.trim() && data.message) ||
            "Something went wrong. Please try again.";
          setActionError(message);
          playSound("error");
          setMessages((current) => current.filter((message) => message.id !== tempId).concat(optimistic));
        } else if (data.message) {
          const normalized: ChatMessage = {
            id: String(data.message.id ?? `${tempId}-assistant`),
            role: data.message.role === "assistant" ? "assistant" : "user",
            parts: normalizeResponse(data.message),
            createdAt: typeof data.message.createdAt === "number" ? data.message.createdAt : Date.now(),
          };
          setMessages((current) => [
            ...current.filter((message) => message.id !== tempId),
            { ...optimistic, id: `${tempId}-synced` },
            normalized,
          ]);
          if (normalized.role === "assistant" && !announcedRef.current.has(normalized.id)) {
            announcedRef.current.add(normalized.id);
            playSound("receive");
          }
        } else {
          setMessages((current) =>
            current.filter((message) => message.id !== tempId).concat(optimistic),
          );
        }
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") {
          setActionError(null);
          return;
        }
        console.error(reason);
        const message =
          reason instanceof Error && reason.message.trim()
            ? reason.message
            : "Something went wrong. Please try again.";
        setActionError(message);
        playSound("error");
        setMessages((current) => current.filter((item) => item.id !== tempId).concat(optimistic));
      } finally {
        abortRef.current = null;
        setSending(false);
      }
    },
    [conversationId, router, sending],
  );

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

  const handleCommandChange = useCallback(
    (value: string) => {
      if (user.role !== "admin") return;
      if (value.startsWith("@")) {
        const query = value.slice(1).toLowerCase();
        setCommandItems(
          employees
            .filter(
              (employee) =>
                employee.fullName.toLowerCase().includes(query) ||
                employee.employeeId.toLowerCase().includes(query),
            )
            .slice(0, 8)
            .map((employee) => ({
              id: employee.employeeId,
              label: employee.fullName,
              value: employee.employeeId,
            })),
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
    },
    [employees, user.role],
  );

  const composer = useMemo(
    () => (
      <ChatComposer
        ref={textareaRef}
        id="chat-input"
        value={input}
        onChange={(value) => {
          setInput(value);
          handleCommandChange(value);
        }}
        onSubmit={() => sendMessage(input)}
        speech={speech}
        sending={sending}
        onStop={() => abortRef.current?.abort()}
        aiConfigured={aiConfigured}
        placeholder="Ask anything..."
        commandMenu={
          <CommandMenu
            open={commandOpen}
            items={commandItems}
            onSelect={(item) => {
              setInput(item.value);
              setCommandOpen(false);
            }}
            onClose={() => setCommandOpen(false)}
          />
        }
        status={
          actionError ? (
            <p
              role="alert"
              className="mt-2 rounded-xl border border-amber-700 bg-amber-700 px-3.5 py-2.5 text-[12.5px] leading-5 text-white dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
            >
              {actionError}
            </p>
          ) : null
        }
      />
    ),
    [
      aiConfigured,
      actionError,
      commandItems,
      commandOpen,
      handleCommandChange,
      input,
      sending,
      speech,
      sendMessage,
      user.role,
    ],
  );

  function refreshConversation() {
    router.refresh();
  }

  if (loading) return <ChatSkeleton />;

  if (loadError) {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <div className="max-w-md rounded-3xl border border-border bg-surface p-7 shadow-card">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-rose-500/12 text-rose-600">
            <MessageSquarePlus className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="mt-4 text-[15px] font-semibold text-ink">Unable to open conversation</p>
          <p className="mt-2 text-sm leading-6 text-ink-muted">{loadError}</p>
          <Link
            href="/chat"
            className="tf-btn-primary mt-5 h-11 px-5 text-sm"
          >
            Start a new chat
          </Link>
        </div>
      </div>
    );
  }

  const isEmpty = messages.length === 0;

  if (isEmpty) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <MobileHeader onOpenMenu={shell.openSidebar} />

        <div className="tf-scroll min-h-0 flex-1 overflow-y-auto">
          <div className="relative mx-auto flex min-h-full w-full max-w-5xl flex-col justify-between gap-7 px-4 pt-6 pb-8 sm:px-6 sm:pt-8 lg:gap-9 lg:px-10 bg-bg">
            <WelcomeHero user={user} />
            <div className="hidden sm:block">{composer}</div>
          </div>
        </div>

        <div className="shrink-0 border-t border-border/70 bg-bg/92 px-3 pt-3 pb-[max(env(safe-area-inset-bottom),12px)] backdrop-blur sm:hidden">
          <div className="mx-auto w-full max-w-3xl">{composer}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <ConversationHeader
        conversationId={conversationId}
        title={title}
        messageCount={messages.length}
        onOpenMenu={shell.openSidebar}
        onChanged={refreshConversation}
      />

      <div ref={messagesRef} className="relative min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-6 sm:py-7">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
          {messages.map((message, index) => {
            const previous = messages[index - 1];
            const showTimestamp =
              Boolean(previous) && message.createdAt - (previous?.createdAt ?? 0) > TIMESTAMP_GAP;

            return (
              <ChatMessageRow
                key={message.id}
                message={message}
                conversationId={conversationId}
                showTimestamp={showTimestamp}
                userName={user.name}
                onRetry={(text) => void sendMessage(text)}
              />
            );
          })}
          {sending && <TypingIndicator />}
          <div ref={bottomRef} className="h-px w-full" aria-hidden="true" />
        </div>

        {showScrollButton && (
          <button
            type="button"
            onClick={scrollToBottom}
            aria-label="Scroll to latest"
            className="absolute bottom-4 right-4 grid h-10 w-10 place-items-center rounded-full border border-border bg-surface text-ink-muted shadow-card transition hover:text-brand sm:right-8"
          >
            <ArrowDown className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="shrink-0 px-3 pt-1 pb-[max(env(safe-area-inset-bottom),8px)] sm:px-6">
        <div className="mx-auto w-full max-w-3xl">{composer}</div>
      </div>
    </div>
  );
}

function ChatSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col" aria-busy="true" aria-label="Loading conversation">
      <div className="h-14 shrink-0 border-b border-border bg-surface/70 px-4 py-4">
        <div className="h-7 w-52 animate-pulse rounded-lg bg-surface-soft" />
      </div>
      <div className="flex-1 space-y-5 px-4 py-7 sm:px-6">
        <div className="ml-auto h-16 w-2/3 animate-pulse rounded-2xl rounded-br-md bg-brand/10" />
        <div className="h-28 w-3/4 animate-pulse rounded-2xl rounded-tl-md bg-surface-soft" />
        <div className="ml-auto h-16 w-1/2 animate-pulse rounded-2xl rounded-br-md bg-brand/10" />
      </div>
      <div className="shrink-0 border-t border-border bg-surface/70 px-4 py-4">
        <div className="mx-auto h-16 max-w-3xl animate-pulse rounded-2xl bg-surface-soft" />
      </div>
    </div>
  );
}
