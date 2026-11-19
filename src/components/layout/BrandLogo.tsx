import { cn } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
  size?: number;
  /** Renders the icon without the wordmark (used in tight spaces). */
  markOnly?: boolean;
  tone?: "default" | "on-dark";
};

/**
 * TaskFlow AI brand mark. Uses the shipped PWA icon so the logo in the
 * sidebar, mobile header and login screen always matches the product icon.
 */
export default function BrandLogo({
  className,
  size = 36,
  markOnly = false,
  tone = "default",
}: BrandLogoProps) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2.5", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- local PWA icon sized
          dynamically; next/image would need static dims and adds optimizer overhead */}
      <img
        src="/icons/icon-192.png"
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-[30%] shadow-[0_4px_12px_rgba(23,101,255,0.35)]"
        style={{ width: size, height: size }}
      />
      {!markOnly && (
        <span className="min-w-0 leading-none">
          <span
            className={cn(
              "block truncate text-[15px] font-bold tracking-tight",
              tone === "on-dark" ? "text-white" : "text-ink",
            )}
          >
            TaskFlow AI
          </span>
          <span
            className={cn(
              "mt-1 block truncate text-[11px] font-medium",
              tone === "on-dark" ? "text-white/60" : "text-ink-muted",
            )}
          >
            AI Agent
          </span>
        </span>
      )}
    </span>
  );
}
