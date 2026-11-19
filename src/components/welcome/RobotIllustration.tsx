import { cn } from "@/lib/utils";

type RobotIllustrationProps = {
  className?: string;
  /** Controls how much space the artwork claims in the hero grid. */
  size?: "sm" | "md" | "lg";
};

const SIZES = {
  sm: "w-44 sm:w-52",
  md: "w-full max-w-[22rem] sm:max-w-[26rem] lg:max-w-[30rem]",
  lg: "w-full max-w-[26rem] sm:max-w-[32rem] lg:max-w-[38rem]",
};

/**
 * TaskFlow AI hero mascot — a hand-built vector asset stored in /public so it
 * stays crisp at every breakpoint, weighs a few KB and needs no network call.
 * The artwork has a transparent background, so it blends into both the light
 * and dark welcome surfaces.
 */
export default function RobotIllustration({ className, size = "md" }: RobotIllustrationProps) {
  return (
    <div
      className={cn("relative mx-auto select-none", SIZES[size], className)}
      aria-hidden="true"
    >
      {/* Soft glow that grounds the artwork on either theme. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-[12%] top-[8%] bottom-[14%] rounded-full bg-brand/12 blur-3xl"
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- local SVG: Next's image
          optimizer skips SVGs (needs dangerouslyAllowSVG) so <Image> adds
          nothing; explicit width/height already prevent layout shift */}
      <img
        src="/images/robot-hero.svg"
        alt=""
        width={800}
        height={800}
        decoding="async"
        fetchPriority="high"
        className="relative h-auto w-full drop-shadow-[0_24px_40px_rgba(11,23,66,0.14)]"
      />
    </div>
  );
}
