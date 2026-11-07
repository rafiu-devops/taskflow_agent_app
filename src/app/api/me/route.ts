import { NextResponse } from "next/server";
import { managementJson } from "@/lib/auth/server";
import type { AgentUser } from "@/types/agent";

export async function GET() {
  const result = await managementJson<{ user: AgentUser }>("/api/me");
  if (!result.ok || !result.data) {
    return NextResponse.json({ error: "Unauthorized" }, { status: result.status === 503 ? 503 : 401 });
  }
  const user = {
    ...result.data.user,
    name: result.data.user.name || result.data.user.email,
    employeeId: result.data.user.employeeId ?? null,
    departmentId: result.data.user.departmentId ?? null,
    permissions: result.data.user.permissions ?? {},
  };
  return NextResponse.json({ user });
}

