"use client";

import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Building2,
  CheckCircle2,
  ClipboardList,
  FileText,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { QuickAction, QuickActionAccent, QuickActionIcon } from "@/lib/agent/quickActions";
import { cn } from "@/lib/utils";

const ICONS: Record<QuickActionIcon, LucideIcon> = {
  employees: Users,
  tasks: ClipboardList,
  performance: BarChart3,
  departments: Building2,
  reports: FileText,
  overdue: AlertTriangle,
  progress: CheckCircle2,
  "add-employee": UserPlus,
};

/**
 * Accent palettes are declared as complete class strings so Tailwind can see
 * them at build time. Colours resolve from the theme tokens, which already
 * switch between the light and dark palettes.
 */
const ACCENTS: Record<QuickActionAccent, { chip: string; arrow: string }> = {
  blue: { chip: "bg-brand/12 text-brand group-hover:bg-brand group-hover:text-white", arrow: "text-brand" },
  green: { chip: "bg-accent-green/12 text-accent-green group-hover:bg-accent-green group-hover:text-white", arrow: "text-accent-green" },
  violet: { chip: "bg-accent-violet/12 text-accent-violet group-hover:bg-accent-violet group-hover:text-white", arrow: "text-accent-violet" },
  cyan: { chip: "bg-accent-cyan/12 text-accent-cyan group-hover:bg-accent-cyan group-hover:text-white", arrow: "text-accent-cyan" },
  amber: { chip: "bg-accent-amber/12 text-accent-amber group-hover:bg-accent-amber group-hover:text-white", arrow: "text-accent-amber" },
  rose: { chip: "bg-accent-rose/12 text-accent-rose group-hover:bg-accent-rose group-hover:text-white", arrow: "text-accent-rose" },
  indigo: { chip: "bg-accent-indigo/12 text-accent-indigo group-hover:bg-accent-indigo group-hover:text-white", arrow: "text-accent-indigo" },
  teal: { chip: "bg-accent-teal/12 text-accent-teal group-hover:bg-accent-teal group-hover:text-white", arrow: "text-accent-teal" },
};

type QuickActionCardProps = {
  action: QuickAction;
  onSelect: (action: QuickAction) => void;
};

/** One interactive quick-action tile. Selecting it runs a real agent prompt. */
export default function QuickActionCard({ action, onSelect }: QuickActionCardProps) {
  const Icon = ICONS[action.icon];
  const accent = ACCENTS[action.accent];

  return (
    <button
      type="button"
      onClick={() => onSelect(action)}
      className={cn(
        "group relative flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-surface p-4 text-left",
        "shadow-card transition duration-200",
        "hover:-translate-y-0.5 hover:border-brand hover:shadow-glow",
        "focus-visible:-translate-y-0.5 focus-visible:border-brand",
        "active:translate-y-0",
        action.wide && "col-span-2 md:col-span-1",
      )}
    >
      <span className="flex items-start justify-between gap-3">
        <span
          className={cn(
            "grid h-11 w-11 shrink-0 place-items-center rounded-xl transition duration-200",
            accent.chip,
          )}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <ArrowUpRight
          className={cn(
            "h-4 w-4 shrink-0 opacity-45 transition duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100",
            accent.arrow,
          )}
          aria-hidden="true"
        />
      </span>

      <span className="min-w-0">
        <span className="block truncate text-[14px] font-semibold leading-5 text-ink">
          {action.title}
        </span>
        <span className="mt-1 block text-[12px] leading-5 text-ink-muted">
          {action.description}
        </span>
      </span>
    </button>
  );
}
