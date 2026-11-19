import { NextResponse } from "next/server";
import { getManagementUser } from "@/lib/auth/server";

/** GET /api/me — normalized profile for the signed-in user. */
export async function GET() {
  const user = await getManagementUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ user });
}
