/**
 * Display-name resolution helpers shared by the server (profile merge) and
 * the client (greeting fallbacks).
 *
 * Order of precedence, highest first:
 *   1. Saved profile display name (Firestore `taskflow_profiles` document)
 *   2. Name returned by the management backend profile (`/api/me`)
 *   3. Local part of the email address
 *
 * The full email address is never used as a greeting.
 */

const MAX_DISPLAY_NAME = 60;

export function maxDisplayNameLength(): number {
  return MAX_DISPLAY_NAME;
}

/** Collapse whitespace and trim a candidate display name. */
export function normalizeDisplayName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_DISPLAY_NAME);
}

/**
 * Turn `rafiu.ahmed@example.com` into `Rafiu Ahmed`.
 * Falls back to the raw local part when there is nothing to split on.
 */
export function emailPrefix(email: unknown): string {
  const raw = String(email ?? "").trim();
  const local = raw.includes("@") ? raw.slice(0, raw.indexOf("@")) : raw;
  const words = local
    .split(/[._\-+]+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  if (words.length) return words.join(" ");
  return local || "there";
}

/** First name only, used for the compact greeting ("Hello Rafiu"). */
export function firstName(name: unknown): string {
  const normalized = normalizeDisplayName(name);
  if (!normalized) return "";
  return normalized.split(" ")[0] ?? normalized;
}

/** True when a candidate "name" is really just an email address. */
export function looksLikeEmail(value: unknown): boolean {
  return normalizeDisplayName(value).includes("@");
}

/**
 * Apply the documented precedence chain to a backend profile name.
 * Backend records that only carry the email address fall through to the prefix
 * so the greeting never displays a full address.
 */
export function resolveDisplayName(
  profileName: unknown,
  backendName: unknown,
  email: unknown,
): string {
  const fromProfile = normalizeDisplayName(profileName);
  if (fromProfile) return fromProfile;

  const fromBackend = normalizeDisplayName(backendName);
  if (fromBackend && !looksLikeEmail(fromBackend)) return fromBackend;

  return emailPrefix(email);
}
