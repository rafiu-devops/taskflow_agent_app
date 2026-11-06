"use client";

import { useEffect, useState } from "react";

export default function PwaRegister() {
  const [installPrompt, setInstallPrompt] = useState<null | { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.error("Service worker registration failed", error);
      });
    }

    const handler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as unknown as { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> });
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!installPrompt) return null;

  return (
    <button
      type="button"
      onClick={async () => {
        await installPrompt.prompt();
        await installPrompt.userChoice.catch(() => undefined);
        setInstallPrompt(null);
      }}
      className="fixed bottom-24 right-4 z-40 rounded-full bg-navy px-4 py-2 text-xs font-bold text-cyan shadow-lg shadow-slate-900/10 hover:bg-navy-soft max-lg:bottom-20"
    >
      Install TaskFlow
    </button>
  );
}
