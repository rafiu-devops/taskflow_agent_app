import { NextResponse } from "next/server";
import { getManagementUser } from "@/lib/auth/server";
import { createConversation, listConversations } from "@/lib/conversations/store";
import { createConversationSchema } from "@/lib/validation";

export async function GET() {
  const user = await getManagementUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const conversations = await listConversations(user.email);
  return NextResponse.json({ conversations });
}

export async function POST(request: Request) {
  const user = await getManagementUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const parsed = createConversationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid conversation title" }, { status: 400 });
  }
  const conversation = await createConversation(user.email, parsed.data.title ?? "New conversation");
  return NextResponse.json({ conversation: { ...conversation, messages: undefined } }, { status: 201 });
}
