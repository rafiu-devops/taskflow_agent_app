import { cn } from "@/lib/utils";

export default function Badge({ value, className = "" }: { value: string | null | undefined; className?: string }) {
  const label = value?.trim() || "Not set";
  const status = label.toLowerCase();
  const tone = /active|completed|complete|on track|excellent|success/.test(status)
    ? "bg-emerald-50 text-emerald-700 ring-emerald-600/15"
    : /overdue|inactive|blocked|urgent|error|failed/.test(status)
      ? "bg-rose-50 text-rose-700 ring-rose-600/15"
      : /high/.test(status)
        ? "bg-rose-50 text-rose-700 ring-rose-600/15"
        : /medium|progress|pending|average/.test(status)
          ? "bg-amber-50 text-amber-800 ring-amber-600/15"
          : "bg-slate-100 text-slate-600 ring-slate-500/10";
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset", tone, className)}>
      {label}
    </span>
  );
}
