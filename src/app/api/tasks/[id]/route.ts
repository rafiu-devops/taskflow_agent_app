import { NextResponse } from "next/server";
import { managementAppUrl } from "@/lib/auth/server";
import { getSessionCookie } from "@/lib/auth/server";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionCookie();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const response = await fetch(`${managementAppUrl()}/api/tasks/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      cookie: `taskflow_session=${session}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  return NextResponse.json(data, { status: response.status });
}