"use client";

import { useMemo } from "react";
import type { AgentUser } from "@/types/agent";
import { quickActionsForUser, type QuickAction } from "@/lib/agent/quickActions";
import QuickActionCard from "@/components/welcome/QuickActionCard";

type QuickActionsGridProps = {
  user: AgentUser;
  onSelect: (action: QuickAction) => void;
};

/**
 * Permission-filtered quick actions. Admins and employees each see only the
 * operations their grants actually allow — the same checks the backend re-runs.
 */
export default function QuickActionsGrid({ user, onSelect }: QuickActionsGridProps) {
  const actions = useMemo(() => quickActionsForUser(user), [user]);

  if (!actions.length) {
    return (
      <section aria-labelledby="quick-actions-title">
        <h2 id="quick-actions-title" className="tf-eyebrow">
          Quick actions
        </h2>
        <p className="mt-3 rounded-2xl border border-dashed border-border bg-surface/70 px-4 py-4 text-[13px] leading-6 text-ink-muted">
          No quick actions are enabled for your account yet. You can still ask anything below —
          if your permissions allow it, I&apos;ll take care of it.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="quick-actions-title">
      <div className="flex items-end justify-between gap-3">
        <h2 id="quick-actions-title" className="tf-eyebrow">
          Quick actions
        </h2>
        <span className="text-[11px] font-medium text-ink-muted">
          Picks up where your permissions allow
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3">
        {actions.map((action) => (
          <QuickActionCard key={action.id} action={action} onSelect={onSelect} />
        ))}
      </div>
    </section>
  );
}
