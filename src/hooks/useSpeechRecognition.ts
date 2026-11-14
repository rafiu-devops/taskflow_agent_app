"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: ((event: Event) => void) | null;
  onend: ((event: Event) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

export function useSpeechRecognition(onFinalText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalTranscriptRef = useRef<string>("");
  const lastEmittedRef = useRef<string>("");

  useEffect(() => {
    const SpeechRecognitionCtor =
      typeof window !== "undefined"
        ? ((window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition ??
          (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition)
        : undefined;

    if (!SpeechRecognitionCtor) return;

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onstart = () => {
      setListening(true);
      setError(null);
      finalTranscriptRef.current = "";
      lastEmittedRef.current = "";
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = (event) => {
      setListening(false);
      const messages: Record<string, string> = {
        "not-allowed": "Microphone access was denied. Allow microphone access in your browser settings and try again.",
        "service-not-allowed": "Speech recognition is unavailable for this browser or network. You can still type your message.",
        "audio-capture": "No microphone is available. Check that one is connected and enabled.",
        network: "Speech recognition could not connect. Check your internet connection and try again.",
        "no-speech": "I didn't hear speech. Try again or type your message.",
        aborted: "Voice input stopped. Try again when you're ready.",
      };
      setError(messages[event?.error ?? ""] ?? "Voice input is unavailable right now. Please try again or type your message.");
    };
    recognition.onresult = (event) => {
      const finalParts: string[] = [];
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result?.isFinal) finalParts.push(result[0]?.transcript ?? "");
      }
      const finalText = finalParts.join(" ").trim();
      if (finalText) {
        const key = finalText.toLowerCase();
        if (key !== lastEmittedRef.current) {
          lastEmittedRef.current = key;
          onFinalText(finalText);
        }
      }
    };
    recognitionRef.current = recognition;
    return () => {
      recognition.abort();
      recognitionRef.current = null;
    };
  }, [onFinalText]);

  const start = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      setError("Voice input isn't supported in this browser. Try Chrome or Edge.");
      return;
    }
    setError(null);
    try {
      recognition.start();
    } catch {
      setError("Speech recognition is already running.");
    }
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  return { listening, error, start, stop };
}
