import { NextResponse } from "next/server";
import { getManagementUser, managementJson } from "@/lib/auth/server";

export async function GET() {
  const user = await getManagementUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Only administrators can generate employee IDs." }, { status: 403 });
  }
  const result = await managementJson<{ employeeId: string }>("/api/employees/next-id");
  if (!result.ok || !result.data?.employeeId) {
    return NextResponse.json({ error: "Unable to generate an employee ID." }, { status: result.status || 503 });
  }
  return NextResponse.json({ employeeId: result.data.employeeId });
}
