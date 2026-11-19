import "server-only";

import { Timestamp } from "firebase-admin/firestore";
import { db } from "@/lib/firebaseAdmin";
import { normalizeDisplayName } from "@/lib/displayName";

/**
 * Per-user UI profile overrides owned by the agent app.
 *
 * The management backend is the authority for identity, role and permissions;
 * it does not expose a profile-update endpoint, so display-name edits are kept
 * in this app's own Firestore store (the same project that already holds chat
 * conversations) and scoped to the authenticated user's owner hash.
 */
const COLLECTION = "taskflow_profiles";

export type StoredProfile = {
  displayName: string | null;
};

function docRef(ownerId: string) {
  return db.collection(COLLECTION).doc(ownerId);
}

/** Read the user's saved profile. Never throws — callers fall back gracefully. */
export async function getProfile(ownerId: string): Promise<StoredProfile | null> {
  if (!ownerId) return null;
  try {
    const snapshot = await docRef(ownerId).get();
    if (!snapshot.exists) return null;
    const data = (snapshot.data() ?? {}) as Record<string, unknown>;
    const displayName = normalizeDisplayName(data.displayName);
    return { displayName: displayName || null };
  } catch (error) {
    console.error("Unable to read taskflow profile", error);
    return null;
  }
}

/**
 * Persist the user's display name.
 * Passing an empty value clears the override and reverts to the backend name.
 * Returns the effective display name after the write.
 */
export async function saveProfile(
  ownerId: string,
  displayName: string,
): Promise<{ displayName: string | null }> {
  const cleaned = normalizeDisplayName(displayName);
  if (!ownerId) throw new Error("Missing profile owner");

  try {
    await docRef(ownerId).set(
      {
        displayName: cleaned || null,
        updatedAt: Timestamp.now(),
      },
      { merge: true },
    );
  } catch (error) {
    console.error("Unable to save taskflow profile", error);
    throw new Error("Your display name could not be saved. Please try again.");
  }

  return { displayName: cleaned || null };
}
