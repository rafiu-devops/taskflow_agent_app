"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Menu } from "lucide-react";
import { useAppShell } from "./AppShell";


export default function AppHeader({
  variant,
  title,
  right,
}: {
  variant: "main" | "secondary";
  title: string;
  right?: React.ReactNode;
}) {
  const router = useRouter();
  const { openSidebar } = useAppShell();

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/");
  }

  return (
    <header className="h-14 shrink-0 bg-[var(--surface)] border-b border-[var(--border)] px-3 flex items-center gap-2 pt-[env(safe-area-inset-top)]">
      {variant === "main" ? (
        <button type="button" onClick={openSidebar} aria-label="Open menu" className="lg:hidden size-10 rounded-xl text-[var(--ink)] hover:bg-[var(--bg)] grid place-items-center">
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
      ) : (
        <button type="button" onClick={goBack} aria-label="Go back" className="size-10 rounded-xl text-[var(--ink)] hover:bg-[var(--bg)] grid place-items-center">
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
      )}
      <h1 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-[var(--ink)]">{title}</h1>
      {right ? <div className="flex items-center gap-1">{right}</div> : null}
    </header>
  );
}