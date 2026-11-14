import "server-only";
import { getAiConfig } from "@/lib/ai/config";
import { buildToolDefinitions, executeTool } from "@/lib/ai/tools";
import { systemPrompt } from "@/lib/ai/prompts";
import { hasAnyPermission, hasPermission } from "@/lib/permissions";
import type { AgentUser, ChatMessage, MessagePart, TextPart, ToolResultPart } from "@/types/agent";

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

function messageText(message: ChatMessage): string {
  return message.parts
    .filter((part): part is TextPart => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function historyFor(messages: ChatMessage[]): OpenAiMessage[] {
  return messages.slice(-20).map((message) => {
    const parts = message.parts.filter((part): part is ToolResultPart => part.type === "tool-result");
    const results = parts.map((part) => {
      const output = part.output === undefined ? "" : JSON.stringify(part.output).slice(0, 4000);
      const error = part.error?.message ? ` Result: ${part.error.message}` : "";
      return `Verified operation result: ${output}${error}`;
    });
    const content = [messageText(message), ...results].filter(Boolean).join("\n").slice(0, 7000);
    return { role: message.role, content: content || null };
  });
}

function stripInternalMentions(text: string, tokens: string[]): string {
  let next = text;
  for (const token of tokens) {
    const pattern = new RegExp(token.replace(/[-_]/g, "\\$&"), "gi");
    next = next.replace(pattern, " ");
  }
  return next.replace(/\s{2,}/g, " ").replace(/\s+([,.!?])/g, "$1").trim();
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
  parts: MessagePart[];
}

function knownIntent(user: AgentUser, message: string): { tool?: string; args?: Record<string, unknown>; text?: string } | null {
  const normalized = message.toLowerCase().replace(/[’]/g, "'");
  if (user.role === "employee") {
    const taskQuery = /\b(due today|tasks? for today|today'?s tasks|my tasks|assigned tasks|tasks assigned to me|list my tasks|show my tasks|what(?: are)? my tasks|tasks? do i have)\b/.test(normalized);
    const performanceQuery = /\b(my weekly report|weekly performance|my performance|performance report)\b/.test(normalized);
    if (taskQuery) {
      if (!hasAnyPermission(user, ["TASKS_VIEW_MY", "TASKS_VIEW_DEPARTMENT", "TASKS_VIEW_ALL"])) {
        return { text: "You do not currently have permission to view tasks. Please ask your administrator to enable task access." };
      }
      return { tool: "list_tasks", args: /\b(due today|tasks? for today|today'?s tasks)\b/.test(normalized) ? { due: "today" } : {} };
    }
    if (performanceQuery) {
      if (!hasPermission(user, "PERFORMANCE_VIEW_MY")) {
        return { text: "You do not currently have permission to view your performance report. Please ask your administrator to enable performance access." };
      }
      return { tool: "get_performance", args: {} };
    }
    if (/\bmark .*task.*(done|complete)|\bcomplete .*task\b/.test(normalized)) {
      const id = message.match(/\bTASK-\d+\b/i)?.[0];
      if (!id) return { text: "Which task ID should I mark complete? I can only update a task that is visible to your account." };
      if (!hasPermission(user, "TASKS_COMPLETE")) {
        return { text: "You do not currently have permission to complete tasks. Please ask your administrator to enable task completion." };
      }
      return { tool: "complete_task", args: { taskId: id } };
    }
    if (/\b(permission|permissions)\b/.test(normalized) && /\b(show|view|list|grant|give|assign|remove|revoke|edit|change)\b/.test(normalized)) {
      return { text: "Employee permissions can only be viewed or changed by an administrator." };
    }
    if (/\b(department)\b/.test(normalized) && /\b(create|add|rename|update|edit|change|delete|remove)\b/.test(normalized)) {
      return { text: "Department records can only be created or changed by an administrator." };
    }
    if (/\b(employee|employee record|employee details)\b/.test(normalized) && /\b(edit|update|change)\b/.test(normalized)) {
      return { text: "You can’t edit another employee’s record. Ask an administrator if your own profile details need to change." };
    }
    return null;
  }

  if (/\b(list|show|view|search|find)\b/.test(normalized) && /\b(departments?|teams)\b/.test(normalized)) {
    return { tool: "list_departments", args: {} };
  }
  if (/\b(list|show|view|search|find)\b/.test(normalized) && /\b(employees?|staff|team members)\b/.test(normalized)) {
    return { tool: "search_employees", args: {} };
  }
  if (/\b(list|show|view|find|which|what)\b/.test(normalized) && /\b(tasks?|overdue|pending)\b/.test(normalized)) {
    const status = /\bpending\b/.test(normalized) ? "Pending" : /\bin progress\b/.test(normalized) ? "In Progress" : undefined;
    return { tool: "list_tasks", args: status ? { status } : {} };
  }
  if (/\b(performance|completion rate|team report|analytics)\b/.test(normalized)) return { tool: "get_performance", args: {} };
  if (/\b(add|create|register)\b/.test(normalized) && /\b(employee|staff member)\b/.test(normalized)) {
    return { tool: "propose_create_employee", args: {} };
  }
  if (/\b(create|add)\b/.test(normalized) && /\bdepartment\b/.test(normalized)) {
    const name = message.match(/\b(?:named|called)\s+(.+?)(?:[.!?]|$)/i)?.[1]?.trim();
    return name
      ? { tool: "propose_create_department", args: { departmentName: name } }
      : { text: "What should the new department be named?" };
  }
  return null;
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

  const parts: MessagePart[] = [];
  let lastAssistant: OpenAiMessage | null = null;
  const internalTokens = tools.flatMap((definition) => [definition.function.name]);

  for (let iteration = 0; iteration < 4; iteration += 1) {
    const assistant = await callProvider(config.apiKey, config.baseUrl, config.model, history, tools);
    lastAssistant = assistant;

    if (!assistant.tool_calls?.length) {
      if (iteration === 0) {
        const intent = knownIntent(user, messageText(messages[messages.length - 1]));
        if (intent?.text) return { parts: [{ type: "text", text: intent.text }] };
        if (intent?.tool) {
          const result = await executeTool(intent.tool, intent.args ?? {}, { user });
          const toolResult: ToolResultPart = {
            type: "tool-result",
            id: `intent-${intent.tool}`,
            tool: intent.tool,
            state: result.ok ? "done" : "error",
            input: intent.args,
            output: result.data ?? (result.card ? { card: result.card } : undefined),
            error: result.ok ? undefined : { message: result.message, retryable: true },
          };
          if (result.card) {
            toolResult.output = { ...(typeof toolResult.output === "object" && toolResult.output ? toolResult.output : {}), card: result.card };
          }
          return { parts: [toolResult, { type: "text", text: result.message }] };
        }
      }
      const text = assistant.content?.trim() ?? "";
      if (text) {
        parts.push({ type: "text", text: stripInternalMentions(text, internalTokens) });
      }
      if (!parts.length) {
        parts.push({ type: "text", text: "I’m not sure how to respond to that yet." });
      }
      return { parts };
    }

    // Assistant prose that arrives together with tool calls is internal reasoning context;
    // it must not be surfaced to the user as the reply.

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
      const toolResult: ToolResultPart = {
        type: "tool-result",
        id: call.id,
        tool: call.function.name,
        state: result.ok ? "done" : "error",
        input: args,
        output: result.data ?? (result.card ? { card: result.card } : undefined),
        error: result.ok ? undefined : { message: result.message, retryable: true },
      };
      if (result.card) {
        toolResult.output = { ...(typeof toolResult.output === "object" && toolResult.output ? toolResult.output : {}), card: result.card };
      }
      parts.push(toolResult);
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

  if (!parts.length) {
    parts.push({ type: "text", text: lastAssistant?.content?.trim() || "I completed the tool checks, but could not assemble a final answer. Please try rephrasing your request." });
  }
  return { parts };
}

