"use client";

import Link from "next/link";
import type { AgentUser } from "@/types/agent";
import { firstName } from "@/lib/displayName";
import RobotIllustration from "@/components/welcome/RobotIllustration";

const DESCRIPTION =
  "I'm your TaskFlow AI Agent — an intelligent assistant for workforce management and administrative tasks.";

/**
 * Personalised welcome hero: greeting, mascot and assistant introduction.
 * The display name always comes from the live authenticated profile, so it
 * updates as soon as Settings saves a change.
 */
export default function WelcomeHero({ user }: { user: AgentUser }) {
  const name = firstName(user.name) || "there";

  return (
    <section className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-center lg:gap-8">
      <div className="lg:col-start-1 lg:row-start-1">
        <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-brand">
          <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-brand" />
          TaskFlow AI Agent
        </p>

        <h1 className="mt-3 text-[1.75rem] font-bold leading-[1.15] tracking-tight text-ink sm:text-4xl lg:text-[2.6rem]">
          <span aria-hidden="true" className="mr-1.5">
            👋
          </span>
          Hello {name}!
        </h1>

        <p className="mt-2 text-lg font-semibold leading-7 tracking-tight text-ink sm:text-xl">
          How can I help you today?
        </p>
      </div>

      <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center">
        <RobotIllustration size="md" />
      </div>

      <div className="lg:col-start-1 lg:row-start-2">
        <p className="max-w-xl text-[14.5px] leading-6 text-ink-muted">{DESCRIPTION}</p>
      </div>
    </section>
  );
}

/** Small branding line that closes the welcome screen. */
export function WelcomeFooter() {
  return (
    <footer className="mt-auto pt-6 text-center">
      <p className="text-[11.5px] font-medium text-ink-muted/80">
        TaskFlow AI · Secure workforce assistant ·{" "}
        <Link href="/settings" className="text-brand transition hover:underline">
          Settings
        </Link>
      </p>
    </footer>
  );
}
