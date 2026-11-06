import { NextResponse } from "next/server";
import { getManagementUser } from "@/lib/auth/server";
import { deleteConversation, getConversation, renameConversation } from "@/lib/conversations/store";
import { renameConversationSchema } from "@/lib/validation";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getManagementUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const conversation = await getConversation(id, user.email);
  if (!conversation) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  return NextResponse.json({ conversation });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getManagementUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = renameConversationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid title" }, { status: 400 });
  }
  try {
    const conversation = await renameConversation(id, user.email, parsed.data.title);
    return NextResponse.json({ conversation });
  } catch {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getManagementUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const deleted = await deleteConversation(id, user.email);
  if (!deleted) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
