import { NextResponse } from "next/server";
import { getSessionCookie, managementAppUrl } from "@/lib/auth/server";

const SESSION_COOKIE = "taskflow_session";
const EXPIRED_COOKIE = `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

export async function POST() {
  const session = await getSessionCookie();
  const response = await fetch(`${managementAppUrl()}/api/auth/logout`, {
    method: "POST",
    headers: session ? { cookie: `${SESSION_COOKIE}=${session}`, accept: "application/json" } : { accept: "application/json" },
    cache: "no-store",
  }).catch(() => null);

  const res = NextResponse.json({ ok: true }, { status: 200 });
  const setCookies = response?.headers.getSetCookie?.() ?? [];
  if (setCookies.length) {
    for (const cookie of setCookies) res.headers.append("set-cookie", cookie);
  } else {
    res.headers.append("set-cookie", EXPIRED_COOKIE);
  }
  return res;
}
