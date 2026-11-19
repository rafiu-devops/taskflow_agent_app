"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import type { AgentUser } from "@/types/agent";
import AppSidebar from "@/components/layout/AppSidebar";
import MobileHeader from "@/components/layout/MobileHeader";

type ShellContextValue = {
  openSidebar: () => void;
  /** Live signed-in profile — updated in place when Settings saves a new name. */
  user: AgentUser;
  updateUser: (user: AgentUser) => void;
};

const AppShellContext = createContext<ShellContextValue | null>(null);

/**
 * Access shell chrome (drawer + live profile).
 * Throws outside AppShell so misuse fails loudly instead of silently.
 */
export function useAppShell(): ShellContextValue {
  const context = useContext(AppShellContext);
  if (!context) throw new Error("useAppShell must be used inside AppShell");
  return context;
}

/**
 * Application frame: fixed navy sidebar on desktop, branded header + bottom
 * tab bar on mobile, and a shared user context so profile edits propagate to
 * the sidebar and welcome greeting without a reload.
 */
export default function AppShell({
  user,
  children,
}: {
  user: AgentUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profileUser, setProfileUser] = useState<AgentUser>(user);
  const [prevUser, setPrevUser] = useState<AgentUser>(user);

  // The server re-renders the layout with the fresh profile after a save or a
  // navigation; mirror it into local state so the chrome updates immediately.
  // Adjusted during render (instead of a sync effect) per React's guidance —
  // the guard makes it a no-op during hydration.
  if (prevUser !== user) {
    setPrevUser(user);
    setProfileUser(user);
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Chat screens render their own top bar (branded on the welcome state,
  // conversation header once a thread has messages).
  const onChatRoute = pathname === "/chat" || pathname.startsWith("/chat/");

  const updateUser = useMemo(() => (next: AgentUser) => setProfileUser(next), []);

  const context = useMemo<ShellContextValue>(
    () => ({ openSidebar: () => setDrawerOpen(true), user: profileUser, updateUser }),
    [profileUser, updateUser],
  );

  return (
    <AppShellContext.Provider value={context}>
      <div className="flex h-dvh flex-col overflow-hidden bg-bg text-ink">
        {!onChatRoute && <MobileHeader onOpenMenu={() => setDrawerOpen(true)} />}

        <div className="flex min-h-0 flex-1">
          <aside
            aria-label="Sidebar"
            className="hidden w-72 shrink-0 flex-col border-r border-white/10 bg-sidebar pt-[max(1rem,env(safe-area-inset-top))] pr-4 pb-4 pl-4 text-white lg:flex"
          >
            <AppSidebar user={profileUser} />
          </aside>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
        </div>


      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="presentation">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-[var(--scrim)] backdrop-blur-sm"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="absolute inset-y-0 left-0 flex h-dvh w-[min(20rem,88vw)] flex-col border-r border-white/10 bg-sidebar pt-[max(1rem,env(safe-area-inset-top))] pr-4 pb-[max(1rem,env(safe-area-inset-bottom))] pl-4 text-white shadow-[0_0_60px_rgba(0,0,0,0.5)]"
          >
            <AppSidebar
              user={profileUser}
              onNavigate={() => setDrawerOpen(false)}
              closeControl={
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Close menu"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white/60 transition hover:bg-white/10 hover:text-white"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              }
            />
          </aside>
        </div>
      )}
    </AppShellContext.Provider>
  );
}
