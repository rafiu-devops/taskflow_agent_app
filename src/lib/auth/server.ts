import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomUUID } from "crypto";
import type { AgentUser } from "@/types/agent";

const SESSION_COOKIE = "taskflow_session";

export function managementAppUrl(): string {
  return process.env.MANAGEMENT_APP_URL?.replace(/\/+$/, "") || "http://localhost:3000";
}

export async function getSessionCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value ?? null;
}

function forwardCookie(session: string): string {
  return `${SESSION_COOKIE}=${session}`;
}

export async function managementFetch(
  path: string,
  init: RequestInit = {},
  options: { requireAuth?: boolean } = {},
): Promise<Response> {
  const requireAuth = options.requireAuth ?? true;
  const headers = new Headers(init.headers);
  if (requireAuth) {
    const session = await getSessionCookie();
    if (!session) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }
    headers.set("cookie", forwardCookie(session));
  }
  if (!headers.has("accept")) headers.set("accept", "application/json");
  return fetch(`${managementAppUrl()}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
}

export async function managementJson<T>(
  path: string,
  init: RequestInit = {},
  options: { requireAuth?: boolean } = {},
): Promise<{ ok: boolean; status: number; data: T | null }> {
  try {
    const response = await managementFetch(path, init, options);
    const data = (await response.json().catch(() => null)) as T | null;
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    console.error(`Management request failed for ${path}`, error);
    return { ok: false, status: 503, data: null };
  }
}

export async function getManagementUser(): Promise<AgentUser | null> {
  const result = await managementJson<{ user: AgentUser }>("/api/me");
  if (!result.ok || !result.data?.user) return null;
  const user = result.data.user;
  return {
    ...user,
    name: user.name || user.email,
    employeeId: user.employeeId ?? null,
    departmentId: user.departmentId ?? null,
    permissions: user.permissions ?? {},
  };
}

export async function requireAgentUser(): Promise<AgentUser> {
  const user = await getManagementUser();
  if (!user) redirect("/login");
  return user;
}

export function ownerHash(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}
