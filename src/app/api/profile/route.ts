import { NextResponse } from "next/server";
import { getManagementUser, ownerHash } from "@/lib/auth/server";
import { saveProfile } from "@/lib/profile/store";
import { emailPrefix, normalizeDisplayName } from "@/lib/displayName";
import type { AgentUser } from "@/types/agent";

/**
 * PATCH /api/profile — update the signed-in user's own display name.
 *
 * The name is stored against the caller's owner hash in this app's Firestore
 * profile collection, so a user can only ever edit their own record. Role,
 * permissions and identity continue to come from the management backend and
 * are never accepted from the browser.
 */
export async function PATCH(request: Request) {
  const user = await getManagementUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { displayName?: unknown };
  const cleaned = normalizeDisplayName(body.displayName);

  let saved: { displayName: string | null };
  try {
    saved = await saveProfile(ownerHash(user.email), cleaned);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save your profile" },
      { status: 500 },
    );
  }

  // Effective name: saved override → backend name → email prefix.
  const effectiveName = saved.displayName || user.name || emailPrefix(user.email);

  const updated: AgentUser = { ...user, name: effectiveName };
  return NextResponse.json({ user: updated });
}
