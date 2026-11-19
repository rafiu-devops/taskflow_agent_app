"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "taskflow-theme";
const CHANGE_EVENT = "taskflow:theme-change";
const COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)";

type ThemeContextValue = {
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

function readStoredTheme(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isThemePreference(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

function subscribeTheme(callback: () => void) {
  // CHANGE_EVENT covers updates from this tab, `storage` covers other tabs.
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function readSystemDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(COLOR_SCHEME_QUERY).matches;
}

function subscribeSystemDark(callback: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const query = window.matchMedia(COLOR_SCHEME_QUERY);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

/**
 * Applies the stored light/dark/system preference to <html> and keeps it in
 * sync with the OS when "system" is selected.
 *
 * The preference and the OS scheme are read through `useSyncExternalStore`
 * (localStorage / matchMedia are external stores), so SSR and hydration both
 * use the server snapshots and the client corrects them right after. Only the
 * DOM write lives in an effect — no state is set from it.
 */
export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore<ThemePreference>(
    subscribeTheme,
    readStoredTheme,
    () => "system",
  );
  const systemDark = useSyncExternalStore(subscribeSystemDark, readSystemDark, () => false);
  const resolvedTheme: ResolvedTheme =
    theme === "system" ? (systemDark ? "dark" : "light") : theme;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", resolvedTheme === "dark");
    root.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  const setTheme = useCallback((next: ThemePreference) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage may be unavailable (private mode); the session still applies.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}
