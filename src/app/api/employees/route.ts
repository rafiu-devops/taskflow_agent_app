import { NextResponse } from "next/server";
import { managementJson } from "@/lib/auth/server";

export async function GET() {
  const result = await managementJson<{ employees: unknown[] }>("/api/employees");
  if (!result.ok || !result.data) {
    return NextResponse.json({ employees: [] }, { status: result.status });
  }
  return NextResponse.json(result.data);
}
