"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { History, Home, LogOut, Menu, MessageSquarePlus, Settings, X } from "lucide-react";
import type { AgentUser } from "@/types/agent";
import { cn, initials } from "@/lib/utils";

const AppShellContext = createContext<{ openSidebar: () => void } | null>(null);

export function useAppShell() {
  const context = useContext(AppShellContext);
  if (!context) throw new Error("useAppShell must be used inside AppShell");
  return context;
}

export default function AppShell({ user, children }: { user: AgentUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const context = useMemo(() => ({ openSidebar: () => setOpen(true) }), []);

  const items = [
    { href: "/home", label: "Home", icon: Home },
    { href: "/chat", label: "New chat", icon: MessageSquarePlus },
    { href: "/history", label: "Recent history", icon: History },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

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
    <div className="flex h-full flex-col">
      <Link href="/home" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-2xl p-3 hover:bg-slate-50">
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-primary text-xs font-black text-white">TF</div>
        <div>
          <p className="text-sm font-bold leading-5 text-navy">TaskFlow AI</p>
          <p className="text-[11px] text-muted">Operations assistant</p>
        </div>
      </Link>
      <nav className="mt-6 flex-1 space-y-1" aria-label="Primary navigation">
        {items.map((item) => {
          const active = item.href === "/home" ? pathname === "/home" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold transition",
                active ? "bg-primary-soft text-primary" : "text-slate-600 hover:bg-slate-50 hover:text-navy",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="rounded-3xl bg-navy p-4 text-white">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/10 text-xs font-bold text-cyan">
            {initials(user.name)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="truncate text-[11px] capitalize text-slate-400">{user.role}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={signOut}
          disabled={signingOut}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-white/10 px-3 py-2 text-xs font-bold text-cyan transition hover:bg-white/15 disabled:opacity-60"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          {signingOut ? "Signing out..." : "Sign out"}
        </button>
      </div>
    </div>
  );

  return (
    <AppShellContext.Provider value={context}>
      <div className="min-h-screen bg-transparent text-foreground">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-white/70 bg-white/80 p-5 backdrop-blur-xl lg:block">
          {sidebar}
        </aside>

        {open && (
          <div className="fixed inset-0 z-40 lg:hidden" role="presentation">
            <button className="absolute inset-0 bg-navy/50 backdrop-blur-sm" aria-label="Close menu" onClick={() => setOpen(false)} />
            <aside className="absolute inset-y-0 left-0 w-[min(20rem,88vw)] border-r border-white/70 bg-white p-5 shadow-2xl">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Menu</p>
                <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="rounded-xl p-2 text-muted hover:bg-slate-100 hover:text-navy">
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              {sidebar}
            </aside>
          </div>
        )}

        <div className="min-h-screen lg:pl-72">
          {children}
        </div>
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
      className={cn("grid h-11 w-11 place-items-center rounded-2xl bg-white text-navy shadow-sm transition hover:bg-slate-50 lg:hidden", className)}
    >
      <Menu className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}
