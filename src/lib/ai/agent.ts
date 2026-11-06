import "server-only";
import { getAiConfig } from "@/lib/ai/config";
import { buildToolDefinitions, executeTool } from "@/lib/ai/tools";
import { systemPrompt } from "@/lib/ai/prompts";
import type { AgentUser, ChatCard, ChatMessage } from "@/types/agent";

interface OpenAiToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface OpenAiMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: OpenAiToolCall[];
  tool_call_id?: string;
}

interface OpenAiChatResponse {
  choices?: Array<{ message?: OpenAiMessage }>;
  error?: { message?: string; type?: string };
}

export class AgentProviderError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "AgentProviderError";
    this.status = status;
  }
}

function providerMessage(status: number, payload: OpenAiChatResponse | null): string {
  const provider = payload?.error?.message;
  if (status === 401 || status === 403) return "The AI provider rejected the configured API key.";
  if (status === 429) return "The AI provider is rate-limiting requests. Please try again shortly.";
  if (status >= 500) return "The AI provider is temporarily unavailable. Please try again later.";
  return provider ? "The AI provider returned an error." : "Unable to reach the AI provider.";
}

function historyFor(messages: ChatMessage[]): OpenAiMessage[] {
  return messages.slice(-16).map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

async function callProvider(apiKey: string, baseUrl: string, model: string, messages: OpenAiMessage[], tools: ReturnType<typeof buildToolDefinitions>): Promise<OpenAiMessage> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      tools,
      tool_choice: "auto",
      temperature: 0.2,
    }),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as OpenAiChatResponse | null;
  if (!response.ok) {
    console.error("AI provider error", response.status, payload?.error?.type ?? payload?.error?.message ?? "unknown");
    throw new AgentProviderError(providerMessage(response.status, payload), response.status === 429 ? 429 : 502);
  }
  const message = payload?.choices?.[0]?.message;
  if (!message) throw new AgentProviderError("The AI provider returned an empty response.");
  return message;
}

export interface AgentRunResult {
  content: string;
  cards: ChatCard[];
}

export async function runAgent(user: AgentUser, messages: ChatMessage[]): Promise<AgentRunResult> {
  const config = getAiConfig();
  if (!config) {
    throw new AgentProviderError("TaskFlow AI is not configured. Set AI_API_KEY (and optionally AI_BASE_URL / AI_MODEL) on the agent server.", 503);
  }

  const tools = buildToolDefinitions(user);
  const history: OpenAiMessage[] = [
    { role: "system", content: systemPrompt(user) },
    ...historyFor(messages),
  ];

  const cards: ChatCard[] = [];
  let lastAssistant: OpenAiMessage | null = null;

  for (let iteration = 0; iteration < 4; iteration += 1) {
    const assistant = await callProvider(config.apiKey, config.baseUrl, config.model, history, tools);
    lastAssistant = assistant;

    if (!assistant.tool_calls?.length) {
      return {
        content: assistant.content?.trim() || "I’m not sure how to respond to that yet.",
        cards: cards.slice(0, 4),
      };
    }

    history.push({
      role: "assistant",
      content: assistant.content,
      tool_calls: assistant.tool_calls,
    });

    for (const call of assistant.tool_calls) {
      let args: unknown = {};
      try {
        args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        args = {};
      }
      const result = await executeTool(call.function.name, args, { user });
      if (result.card) cards.push(result.card);
      history.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify({
          ok: result.ok,
          message: result.message,
          permissionRequired: result.permissionRequired,
          data: result.data,
        }),
      });
    }
  }

  return {
    content: lastAssistant?.content?.trim() || "I completed the tool checks, but could not assemble a final answer. Please try rephrasing your request.",
    cards: cards.slice(0, 4),
  };
}
