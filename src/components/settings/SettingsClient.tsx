"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  Bell,
  CheckCircle2,
  Download,
  Info,
  Languages,
  LogOut,
  Mic,
  Monitor,
  Moon,
  ShieldCheck,
  Sun,
  UserRound,
} from "lucide-react";
import { isSoundOn, setSoundOn, unlockAudio, playSound, SOUND_CHANGE_EVENT } from "@/lib/sound";
import { cn } from "@/lib/utils";
import type { AgentUser } from "@/types/agent";
import type { ThemePreference } from "@/components/theme/ThemeProvider";
import { useTheme } from "@/components/theme/ThemeProvider";
import SettingsSection, { SettingsRow } from "@/components/settings/SettingsSection";
import ProfileForm from "@/components/settings/ProfileForm";

type SettingsClientProps = {
  user: AgentUser;
  aiConfigured?: boolean;
  managementUrl?: string;
};

type MicPermission = "granted" | "denied" | "prompt" | "unsupported" | "checking";

const THEME_OPTIONS: Array<{
  id: ThemePreference;
  label: string;
  hint: string;
  icon: typeof Sun;
}> = [
  { id: "light", label: "Light", hint: "Blue-white workspace", icon: Sun },
  { id: "dark", label: "Dark", hint: "Deep navy surfaces", icon: Moon },
  { id: "system", label: "System", hint: "Match your device", icon: Monitor },
];

const SUPPORTED_LANGUAGES = [
  { label: "English", sample: "Show me pending tasks" },
  { label: "اردو", sample: "زیرِ کار کام دکھائیں" },
  { label: "Roman Urdu", sample: "Mujhe apni performance batao" },
  { label: "Sindhi", sample: "پنھنجا ڪم ڏسائو" },
];

/** Subscribes to the sound preference store (see `lib/sound`). */
function subscribeSoundChange(callback: () => void) {
  window.addEventListener(SOUND_CHANGE_EVENT, callback);
  return () => window.removeEventListener(SOUND_CHANGE_EVENT, callback);
}

/** Speech recognition is a static browser capability — never changes. */
function hasSpeechRecognition(): boolean {
  return Boolean(
    (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition,
  );
}

const subscribeNever = () => () => {};

/**
 * Settings page: profile editing, appearance, language, voice and account.
 * Everything here reads from or writes to real state — the display name goes
 * to `PATCH /api/profile`, the theme to the shared ThemeProvider, and sound to
 * the existing `lib/sound` preference.
 */
export default function SettingsClient({
  user,
  aiConfigured = false,
  managementUrl,
}: SettingsClientProps) {
  const router = useRouter();
  const { theme, resolvedTheme, setTheme } = useTheme();

  const [signingOut, setSigningOut] = useState(false);
  const [micPermission, setMicPermission] = useState<MicPermission>("checking");
  const [installPrompt, setInstallPrompt] = useState<null | {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: string }>;
  }>(null);

  // External stores: the sound flag lives in localStorage (notified via
  // SOUND_CHANGE_EVENT) and speech support is a static capability. Server
  // snapshots keep SSR and the hydration pass identical to the markup.
  const soundOn = useSyncExternalStore(subscribeSoundChange, isSoundOn, () => true);
  const speechSupported = useSyncExternalStore<boolean | null>(
    subscribeNever,
    hasSpeechRecognition,
    () => null,
  );

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(
        event as unknown as { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> },
      );
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // Mic availability drives the Voice section's status and guidance.
  useEffect(() => {
    let cancelled = false;

    async function readPermission() {
      try {
        const permissions = navigator.permissions;
        if (!permissions?.query) {
          setMicPermission("prompt");
          return;
        }
        const status = await permissions.query({ name: "microphone" as PermissionName });
        if (cancelled) return;
        setMicPermission(status.state);
        status.addEventListener("change", () => {
          if (!cancelled) setMicPermission(status.state);
        });
      } catch {
        if (!cancelled) setMicPermission("prompt");
      }
    }

    void readPermission();
    return () => {
      cancelled = true;
    };
  }, []);

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  const toggleSound = useCallback((next: boolean) => {
    unlockAudio();
    setSoundOn(next);
    if (next) playSound("receive");
  }, []);

  return (
    <div className="tf-scroll h-full min-h-0 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-12 sm:px-6 sm:pt-8 lg:px-8">
        <header className="min-w-0">
          <p className="tf-eyebrow">Account & preferences</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            Settings
          </h1>
          <p className="mt-1.5 text-[13.5px] text-ink-muted">
            Manage how TaskFlow AI looks, sounds and greets you.
          </p>
        </header>

        <div className="mt-7 space-y-5">
          <SettingsSection
            title="Profile"
            description="Your identity across the app — shown in the sidebar and welcome greeting."
            icon={UserRound}
          >
            <ProfileForm user={user} />
          </SettingsSection>

          <SettingsSection
            title="Appearance"
            description="Choose how TaskFlow AI looks on this device."
            icon={resolvedTheme === "dark" ? Moon : Sun}
          >
            <div
              role="radiogroup"
              aria-label="Theme"
              className="grid grid-cols-1 gap-3 sm:grid-cols-3"
            >
              {THEME_OPTIONS.map((option) => {
                const Icon = option.icon;
                const active = theme === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setTheme(option.id)}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition",
                      active
                        ? "border-brand bg-brand/8 shadow-[0_0_0_3px_var(--ring-brand)]"
                        : "border-border bg-surface hover:border-brand/50 hover:bg-surface-soft",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "grid h-9 w-9 shrink-0 place-items-center rounded-xl",
                        active ? "bg-brand text-white" : "bg-surface-soft text-ink-muted",
                      )}
                    >
                      <Icon className="h-4.5 w-4.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-semibold text-ink">
                        {option.label}
                      </span>
                      <span className="block truncate text-[11.5px] text-ink-muted">
                        {option.hint}
                      </span>
                    </span>
                    {active && (
                      <CheckCircle2
                        className="h-4.5 w-4.5 shrink-0 text-brand"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </SettingsSection>

          <SettingsSection
            title="Language"
            description="The agent replies in whichever language you write in — no switching needed."
            icon={Languages}
            action={
              <span className="rounded-full bg-success/12 px-3 py-1 text-[11.5px] font-bold text-success">
                Auto-detect
              </span>
            }
          >
            <ul className="grid gap-2.5 sm:grid-cols-2">
              {SUPPORTED_LANGUAGES.map((language) => (
                <li
                  key={language.label}
                  className="rounded-2xl border border-border bg-surface px-4 py-3"
                >
                  <p className="text-[13.5px] font-semibold text-ink">{language.label}</p>
                  <p dir="auto" className="mt-0.5 truncate text-[12.5px] text-ink-muted">
                    {language.sample}
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-3.5 text-[12.5px] leading-5 text-ink-muted">
              Type or dictate in English, Urdu script, Roman Urdu or Sindhi and the reply
              follows your language.
            </p>
          </SettingsSection>

          <SettingsSection
            title="Voice"
            description="Speak your message instead of typing it."
            icon={Mic}
            action={
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-bold",
                  micPermission === "granted"
                    ? "bg-success/12 text-success"
                    : micPermission === "denied"
                      ? "bg-danger/12 text-danger"
                      : "bg-surface-soft text-ink-muted",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    micPermission === "granted"
                      ? "bg-success"
                      : micPermission === "denied"
                        ? "bg-danger"
                        : "bg-ink-muted",
                  )}
                />
                {micPermission === "granted"
                  ? "Microphone ready"
                  : micPermission === "denied"
                    ? "Blocked"
                    : micPermission === "checking"
                      ? "Checking..."
                      : "Ask on first use"}
              </span>
            }
          >
            <VoiceGuidance
              permission={micPermission}
              speechSupported={speechSupported}
            />

            <div className="mt-4 border-t border-border pt-2">
              <div className="flex flex-wrap items-center justify-between gap-3 py-2">
                <span className="flex items-center gap-2 text-[13.5px] font-medium text-ink">
                  <Bell className="h-4 w-4 text-ink-muted" aria-hidden="true" />
                  Notification sounds
                </span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => toggleSound(true)}
                    className="text-[12.5px] font-semibold text-brand transition hover:underline"
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={soundOn}
                    aria-label="Notification sounds"
                    onClick={() => toggleSound(!soundOn)}
                    className={cn(
                      "relative h-6 w-11 shrink-0 rounded-full transition",
                      soundOn ? "bg-brand" : "bg-border",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all",
                        soundOn ? "left-[22px]" : "left-0.5",
                      )}
                    />
                  </button>
                </div>
              </div>
            </div>
          </SettingsSection>

          <SettingsSection
            title="Account"
            description="Signed-in identity and session controls."
            icon={ShieldCheck}
          >
            <div className="divide-y divide-border">
              <SettingsRow label="Email">{user.email}</SettingsRow>
              <SettingsRow label="Role">
                {user.role === "admin" ? "Admin" : "Employee"}
              </SettingsRow>
              <SettingsRow label="Assistant model">
                {aiConfigured ? "Gemini 3.1 Flash Lite" : "Not configured"}
              </SettingsRow>
              {managementUrl && (
                <SettingsRow label="Management console" hint="Opens in a new tab">
                  <a
                    href={managementUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-brand transition hover:underline"
                  >
                    Open console
                  </a>
                </SettingsRow>
              )}
              <SettingsRow label="Offline help">
                <Link
                  href="/offline"
                  className="font-semibold text-brand transition hover:underline"
                >
                  View guide
                </Link>
              </SettingsRow>
            </div>

            {installPrompt && (
              <button
                type="button"
                onClick={async () => {
                  await installPrompt.prompt();
                  await installPrompt.userChoice.catch(() => undefined);
                  setInstallPrompt(null);
                }}
                className="tf-btn-ghost mt-4 h-11 w-full px-4 text-sm"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Install app
              </button>
            )}

            <button
              type="button"
              onClick={() => void signOut()}
              disabled={signingOut}
              className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-danger/35 bg-danger/8 text-[14px] font-semibold text-danger transition hover:bg-danger/15 disabled:opacity-60"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              {signingOut ? "Signing out..." : "Sign out"}
            </button>
          </SettingsSection>
        </div>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-[11.5px] text-ink-muted">
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
          TaskFlow AI · Secure workforce assistant
        </p>
      </div>
    </div>
  );
}

/** Voice section body: current mic state plus actionable guidance. */
function VoiceGuidance({
  permission,
  speechSupported,
}: {
  permission: MicPermission;
  speechSupported: boolean | null;
}) {
  if (speechSupported === false) {
    return (
      <p className="rounded-2xl border border-border bg-surface-soft px-4 py-3 text-[13px] leading-6 text-ink-muted">
        This browser doesn&apos;t support speech recognition. Voice input works best in
        Chrome or Edge — you can still type your message anywhere.
      </p>
    );
  }

  if (permission === "denied") {
    return (
      <p className="rounded-2xl border border-danger/30 bg-danger/8 px-4 py-3 text-[13px] leading-6 text-danger">
        Microphone access is blocked. Open your browser&apos;s site settings for this page,
        allow the microphone, then reload and tap the mic in the composer.
      </p>
    );
  }

  if (permission === "granted") {
    return (
      <p className="rounded-2xl border border-success/30 bg-success/8 px-4 py-3 text-[13px] leading-6 text-ink">
        Microphone access is granted. Tap the mic in the composer, speak, and your words are
        transcribed into the message box — then send as usual.
      </p>
    );
  }

  return (
    <p className="rounded-2xl border border-border bg-surface-soft px-4 py-3 text-[13px] leading-6 text-ink-muted">
      Tap the mic in the composer and allow microphone access when your browser asks. Voice
      input transcribes into the message box so you can edit before sending.
    </p>
  );
}
