"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Settings, History } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { id: "home", label: "Home", href: "/chat", icon: Home, match: (p: string) => p === "/" || p === "/home" || p.startsWith("/chat") },
  { id: "history", label: "History", href: "/history", icon: History, match: (p: string) => p.startsWith("/history") },
  { id: "settings", label: "Settings", href: "/settings", icon: Settings, match: (p: string) => p.startsWith("/settings") },
] as const;

/** Bottom tab bar for phones and small tablets. Hidden from `lg` up. */
export default function MobileBottomNavigation() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Bottom navigation"
      className="flex h-16 shrink-0 items-stretch border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
    >
      {ITEMS.map((item) => {
        const Icon = item.icon;
        const active = item.match(pathname);
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 pt-1.5 text-[10.5px] font-semibold transition",
              active ? "text-brand" : "text-ink-muted hover:text-ink",
            )}
          >
            {active && (
              <span
                aria-hidden="true"
                className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-brand"
              />
            )}
            <span
              className={cn(
                "grid h-8 w-12 place-items-center rounded-full transition",
                active && "bg-brand/10",
              )}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
