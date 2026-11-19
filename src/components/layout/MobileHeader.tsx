"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Menu, Settings } from "lucide-react";
import BrandLogo from "@/components/layout/BrandLogo";

type MobileHeaderProps = {
  onOpenMenu: () => void;
  /** Extra actions rendered on the trailing edge (replaces the default gear). */
  right?: React.ReactNode;
  showStatus?: boolean;
};

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

const getOnline = () => navigator.onLine;
const getServerOnline = () => true;

/**
 * Branded mobile top bar: logo, product name, live connectivity status and a
 * menu trigger that opens the navigation drawer.
 */
export default function MobileHeader({
  onOpenMenu,
  right,
  showStatus = true,
}: MobileHeaderProps) {
  const online = useSyncExternalStore(subscribeOnline, getOnline, getServerOnline);

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface/85 px-3 backdrop-blur-xl lg:hidden">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Open menu"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-ink transition hover:bg-surface-soft"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      <Link href="/chat" className="min-w-0 flex-1" aria-label="TaskFlow AI home">
        <BrandLogo size={30} />
      </Link>

      {showStatus && (
        <span
          className="hidden shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface-soft px-2.5 py-1 text-[11px] font-semibold text-ink-muted sm:flex"
          title={online ? "Connected" : "Offline"}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${online ? "bg-success" : "bg-warning"}`}
            aria-hidden="true"
          />
          {online ? "Online" : "Offline"}
        </span>
      )}

      {right ?? (
        <Link
          href="/settings"
          aria-label="Open settings"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-ink-muted transition hover:bg-surface-soft hover:text-ink"
        >
          <Settings className="h-5 w-5" aria-hidden="true" />
        </Link>
      )}
    </header>
  );
}
