import { NextResponse } from "next/server";
import { managementAppUrl } from "@/lib/auth/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = String((body as { email?: unknown })?.email ?? "")
    .trim()
    .toLowerCase();

  if (!email || !email.includes("@") || email.length > 254) {
    return NextResponse.json({ error: "Enter a valid work email" }, { status: 400 });
  }

  const managementResponse = await fetch(`${managementAppUrl()}/api/auth/signin`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({ email }),
    cache: "no-store",
  });

  const data = await managementResponse.json().catch(() => ({ error: "Sign-in failed" }));
  const response = NextResponse.json(data, { status: managementResponse.status });
  const setCookies = managementResponse.headers.getSetCookie?.() ?? [];
  for (const cookie of setCookies) {
    response.headers.append("set-cookie", cookie);
  }
  return response;
}
