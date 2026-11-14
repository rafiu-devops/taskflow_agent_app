import { NextResponse } from "next/server";
import { getManagementUser } from "@/lib/auth/server";
import { executeTool } from "@/lib/ai/tools";
import { getConversation, appendMessage } from "@/lib/conversations/store";
import type { ToolResultPart } from "@/types/agent";

export async function POST(request: Request) {
  const user = await getManagementUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Only administrators can create employees." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const conversationId = typeof body.conversationId === "string" ? body.conversationId : null;
  const employee = body.employee && typeof body.employee === "object" && !Array.isArray(body.employee)
    ? body.employee as Record<string, unknown>
    : null;
  if (!conversationId || !employee) {
    return NextResponse.json({ error: "A conversation and employee details are required." }, { status: 400 });
  }

  let conversation = await getConversation(conversationId, user);
  if (!conversation) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

  const result = await executeTool("create_employee", employee, { user, allowEmployeeCreation: true });

  const toolResult: ToolResultPart = {
    type: "tool-result",
    id: "employee-create",
    tool: "create_employee",
    state: result.ok ? "done" : "error",
    input: employee,
    output: result.data ?? (result.card ? { card: result.card } : undefined),
    error: result.ok ? undefined : { message: result.message, retryable: true },
  };
  const textPart = { type: "text" as const, text: result.message };

  conversation = await appendMessage(conversation.id, user, { role: "assistant", parts: [toolResult, textPart] });

  return NextResponse.json(
    { ok: result.ok, error: result.ok ? undefined : result.message, result, conversationId: conversation.id },
    { status: result.ok ? 200 : result.statusCode ?? 400 },
  );
}
