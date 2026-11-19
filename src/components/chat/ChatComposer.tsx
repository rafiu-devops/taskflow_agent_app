"use client";

import { forwardRef, useEffect, useRef } from "react";
import { Languages, Mic, MicOff, Send, Sparkles, Square } from "lucide-react";
import { cn } from "@/lib/utils";

export type ComposerSpeech = {
  listening: boolean;
  error: string | null;
  start: () => void;
  stop: () => void;
};

type ChatComposerProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  speech: ComposerSpeech;
  placeholder?: string;
  /** Shows the stop button and swaps the mic for a live recording state. */
  sending?: boolean;
  onStop?: () => void;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Renders the @ / command palette anchored above the input. */
  commandMenu?: React.ReactNode;
  /** Free-form status row (send failures, tips) rendered under the shell. */
  status?: React.ReactNode;
  aiConfigured?: boolean;
  className?: string;
};

/**
 * Rounded message composer shared by the welcome screen and active chats.
 * Voice capture, microphone permissions and transcription all come from the
 * existing `useSpeechRecognition` hook — this component only presents them.
 */
const ChatComposer = forwardRef<HTMLTextAreaElement, ChatComposerProps>(function ChatComposer(
  {
    id,
    value,
    onChange,
    onSubmit,
    speech,
    placeholder = "Ask anything...",
    sending = false,
    onStop,
    disabled = false,
    autoFocus = false,
    commandMenu,
    status,
    aiConfigured = true,
    className,
  },
  forwardedRef,
) {
  const innerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const node = innerRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 176)}px`;
  }, [value]);

  function setRefs(node: HTMLTextAreaElement | null) {
    innerRef.current = node;
    if (typeof forwardedRef === "function") forwardedRef(node);
    else if (forwardedRef) (forwardedRef as React.RefObject<HTMLTextAreaElement | null>).current = node;
  }

  return (
    <div className={cn("w-full", className)}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        className="relative"
      >
        {commandMenu}

        <div
          className={cn(
            "rounded-[1.5rem] border bg-surface p-1.5 shadow-card transition",
            "focus-within:border-brand focus-within:shadow-glow",
            speech.listening ? "border-rose-400/70 ring-4 ring-rose-500/12" : "border-border",
          )}
        >
          <div className="flex items-end gap-1.5">
            <button
              type="button"
              onClick={speech.listening ? speech.stop : speech.start}
              aria-label={speech.listening ? "Stop voice input" : "Start voice input"}
              aria-pressed={speech.listening}
              className={cn(
                "grid h-11 w-11 shrink-0 place-items-center rounded-xl transition",
                speech.listening
                  ? "bg-rose-500 text-white shadow-[0_6px_16px_rgba(244,63,94,0.35)]"
                  : "text-ink-muted hover:bg-surface-soft hover:text-brand",
              )}
            >
              {speech.listening ? (
                <span className="relative grid place-items-center">
                  <MicOff className="h-5 w-5" aria-hidden="true" />
                  <span className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-ping rounded-full bg-white" />
                </span>
              ) : (
                <Mic className="h-5 w-5" aria-hidden="true" />
              )}
            </button>

            <label className="sr-only" htmlFor={id}>
              {placeholder}
            </label>
            <textarea
              ref={setRefs}
              id={id}
              rows={1}
              value={value}
              autoFocus={autoFocus}
              disabled={disabled}
              dir="auto"
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  onSubmit();
                }
              }}
              placeholder={placeholder}
              className="max-h-44 min-h-11 flex-1 resize-none bg-transparent px-1 py-2.5 text-[15px] leading-6 text-ink outline-none placeholder:text-ink-muted disabled:opacity-60"
            />

            {sending && onStop ? (
              <button
                type="button"
                onClick={onStop}
                aria-label="Stop generating"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface-soft text-ink-muted transition hover:text-ink"
              >
                <Square className="h-4 w-4 fill-current" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={disabled || !value.trim()}
                aria-label="Send message"
                className={cn(
                  "grid h-11 w-11 shrink-0 place-items-center rounded-xl transition",
                  value.trim() && !disabled
                    ? "bg-brand text-white shadow-[0_8px_18px_rgba(37,99,235,0.35)] hover:bg-brand-bright"
                    : "bg-surface-soft text-ink-muted",
                )}
              >
                <Send className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 pb-1 pt-0.5 text-[10.5px] font-medium text-ink-muted">
            <span className="inline-flex items-center gap-1.5">
              <Languages className="h-3.5 w-3.5" aria-hidden="true" />
              Roman Urdu · اردو supported
            </span>
            {aiConfigured && (
              <span className="inline-flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
                Gemini powered
              </span>
            )}
          </div>
        </div>
      </form>

      {speech.listening && (
        <p
          role="status"
          className="mt-2 flex items-center gap-2 px-2 text-[12px] font-semibold text-rose-600"
        >
          <span className="flex items-end gap-0.5" aria-hidden="true">
            {[0, 1, 2, 3].map((index) => (
              <span
                key={index}
                className="w-0.5 animate-pulse rounded-full bg-rose-500"
                style={{
                  height: `${6 + (index % 2) * 6}px`,
                  animationDelay: `${index * 120}ms`,
                }}
              />
            ))}
          </span>
          Listening… speak now.
          <button
            type="button"
            onClick={speech.stop}
            className="ml-1 rounded-full border border-rose-300 px-2 py-0.5 text-[11px] font-bold text-rose-600 transition hover:bg-rose-500 hover:text-white"
          >
            Stop
          </button>
        </p>
      )}

      {!speech.listening && speech.error && (
        <p role="alert" className="mt-2 rounded-xl bg-surface px-3 py-2 text-[12px] leading-5 text-rose-600">
          {speech.error}
        </p>
      )}

      {status}
    </div>
  );
});

export default ChatComposer;
