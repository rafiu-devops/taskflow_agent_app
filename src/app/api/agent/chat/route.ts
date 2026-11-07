import { NextResponse } from "next/server";
import { getManagementUser } from "@/lib/auth/server";
import { appendMessage, createConversation, getConversation } from "@/lib/conversations/store";
import { chatRequestSchema } from "@/lib/validation";
import { isAiConfigured } from "@/lib/ai/config";
import { AgentProviderError, runAgent } from "@/lib/ai/agent";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;
const buckets = new Map<string, number[]>();

function rateLimit(key: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const hits = (buckets.get(key) ?? []).filter((timestamp) => timestamp >= windowStart);
  if (hits.length >= RATE_LIMIT_MAX) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  return true;
}

export async function POST(request: Request) {
  const user = await getManagementUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!rateLimit(user.email)) {
    return NextResponse.json({ error: "Too many requests. Please wait a moment and try again." }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  let conversation = parsed.data.conversationId
    ? await getConversation(parsed.data.conversationId, user.email)
    : null;
  if (parsed.data.conversationId && !conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }
  if (!conversation) {
    conversation = await createConversation(user.email);
  }

  conversation = await appendMessage(conversation.id, user.email, {
    role: "user",
    parts: [{ type: "text", text: parsed.data.message }],
  });

  if (!isAiConfigured()) {
    const content = "TaskFlow AI is not configured on the agent server. An administrator must set AI_API_KEY (and optionally AI_BASE_URL / AI_MODEL) before the agent can respond.";
    conversation = await appendMessage(conversation.id, user.email, {
      role: "assistant",
      parts: [
        { type: "text", text: content },
        { type: "tool-result", id: "config", tool: "notice", state: "done", output: { card: { type: "notice", tone: "warning", title: "AI provider not configured", message: content } } },
      ],
    });
    return NextResponse.json({
      conversationId: conversation.id,
      message: conversation.messages[conversation.messages.length - 1],
      error: content,
      code: "AI_NOT_CONFIGURED",
    }, { status: 503 });
  }

  try {
    const result = await runAgent(user, conversation.messages);
    conversation = await appendMessage(conversation.id, user.email, {
      role: "assistant",
      parts: result.parts,
    });
    return NextResponse.json({
      conversationId: conversation.id,
      message: conversation.messages[conversation.messages.length - 1],
      title: conversation.title,
    });
  } catch (error) {
    const status = error instanceof AgentProviderError ? error.status : 502;
    const content = error instanceof Error ? error.message : "The agent is unavailable right now.";
    console.error("Agent chat failed", error);
    conversation = await appendMessage(conversation.id, user.email, {
      role: "assistant",
      parts: [
        { type: "text", text: content },
        { type: "tool-result", id: "error", tool: "notice", state: "error", error: { message: content, retryable: true }, output: { card: { type: "notice", tone: "error", title: "Agent unavailable", message: content } } },
      ],
    });
    return NextResponse.json({
      conversationId: conversation.id,
      message: conversation.messages[conversation.messages.length - 1],
      error: content,
      code: "AGENT_UNAVAILABLE",
    }, { status });
  }
}

