import type { LucideIcon } from "lucide-react";

type SettingsSectionProps = {
  /** Section heading shown in the card header. */
  title: string;
  /** One-line explanation rendered under the heading. */
  description?: string;
  icon?: LucideIcon;
  /** Optional control rendered on the header's right edge (e.g. a toggle). */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

/**
 * White card used by every block on the Settings page so spacing, border,
 * radius and shadow stay identical across Profile, Appearance, Language,
 * Voice and Account.
 */
export default function SettingsSection({
  title,
  description,
  icon: Icon,
  action,
  children,
  className = "",
}: SettingsSectionProps) {
  return (
    <section className={`tf-card overflow-hidden ${className}`}>
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3.5 sm:px-5">
        {Icon && (
          <span
            aria-hidden="true"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-soft text-brand"
          >
            <Icon className="h-4.5 w-4.5" />
          </span>
        )}

        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold leading-5 text-ink">{title}</h2>
          {description && (
            <p className="mt-0.5 text-[12.5px] leading-5 text-ink-muted">{description}</p>
          )}
        </div>

        {action && <div className="shrink-0">{action}</div>}
      </header>

      <div className="px-4 py-4 sm:px-5">{children}</div>
    </section>
  );
}

/** Label + value row used inside a section for read-only facts. */
export function SettingsRow({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
      <span className="text-[13.5px] font-medium text-ink">{label}</span>
      <span className="min-w-0 text-right text-[13.5px] text-ink-muted">
        <span className="block break-words">{children}</span>
        {hint && <span className="mt-0.5 block text-[11.5px]">{hint}</span>}
      </span>
    </div>
  );
}
