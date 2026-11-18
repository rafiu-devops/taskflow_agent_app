import "server-only";
import { getAiConfig } from "@/lib/ai/config";
import { buildToolDefinitions, executeTool, type ToolExecutionResult } from "@/lib/ai/tools";
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

type KnownIntent = { tool?: string; args?: Record<string, unknown>; text?: string; taskMode?: "today" | "pending" | "inProgress" | "completed" | "completedToday" | "overdue" | "history" | "assignedToday" | "all" };

function employeeTaskReply(mode: NonNullable<KnownIntent["taskMode"]>, result: ToolExecutionResult): string {
  if (!result.ok) {
    return result.message.toLowerCase().includes("permission")
      ? result.message
      : "I couldn't retrieve your tasks right now. Please try again.";
  }
  const data = result.data && typeof result.data === "object" ? result.data as Record<string, unknown> : {};
  const summary = data.summary && typeof data.summary === "object" ? data.summary as Record<string, unknown> : {};
  const count = (key: string) => typeof summary[key] === "number" ? summary[key] as number : 0;
  const total = count("totalAssignedTasks");
  const pending = count("pendingTasks");
  const completed = count("completedTasks");
  const inProgress = count("inProgressTasks");
  const overdue = count("overdueTasks");

  if (mode === "today") {
    const due = count("tasksDueToday");
    const openDue = count("openTasksDueToday");
    if (!due && !total) return "You currently don't have any tasks assigned. You're all caught up!";
    if (!due) {
      const upcoming = count("pendingTasksUpcoming");
      const unscheduled = count("pendingTasksUnscheduled");
      if (upcoming) return `You don't have any tasks due today. You have ${upcoming} pending task${upcoming === 1 ? "" : "s"} scheduled for upcoming days.`;
      if (unscheduled) return `You don't have any tasks due today. You have ${unscheduled} pending task${unscheduled === 1 ? "" : "s"} without a due date.`;
      if (overdue) return `You don't have any tasks due today, but you have ${overdue} overdue task${overdue === 1 ? "" : "s"} that need attention.`;
      return "You don't have any tasks due today.";
    }
    return openDue
      ? `You have ${openDue} open task${openDue === 1 ? "" : "s"} due today.`
      : `You had ${due} task${due === 1 ? "" : "s"} due today, and they are completed.`;
  }
  if (mode === "pending") {
    if (pending) return `You have ${pending} pending task${pending === 1 ? "" : "s"}.`;
    if (!total) return "You currently don't have any tasks assigned. You're all caught up!";
    return completed
      ? `You don't have any pending tasks right now. You've completed ${completed} task${completed === 1 ? "" : "s"} previously.`
      : `You don't have any pending tasks right now${inProgress ? `; you have ${inProgress} in progress` : ""}.`;
  }
  if (mode === "inProgress") return inProgress ? `You have ${inProgress} task${inProgress === 1 ? "" : "s"} in progress.` : "You don't have any tasks in progress.";
  if (mode === "overdue") return overdue ? `You have ${overdue} overdue task${overdue === 1 ? "" : "s"} that need your attention.` : total ? "You don't have any overdue tasks." : "You currently don't have any tasks assigned. You're all caught up!";
  if (mode === "completedToday") {
    const completedToday = count("completedToday");
    return completedToday ? `You completed ${completedToday} task${completedToday === 1 ? "" : "s"} today.` : "You haven't completed any tasks today.";
  }
  if (mode === "assignedToday") {
    const assignedToday = count("assignedToday");
    return assignedToday ? `${assignedToday} task${assignedToday === 1 ? " was" : "s were"} assigned to you today.` : "You don't have any tasks assigned today.";
  }
  if (mode === "completed") {
    if (completed) return `You've completed ${completed} task${completed === 1 ? "" : "s"}.`;
    return total ? "You haven't completed any tasks yet." : "You currently don't have any tasks assigned. You're all caught up!";
  }
  if ((mode === "history" || mode === "all") && total === 0) return "You currently don't have any tasks assigned. You're all caught up!";
  if (mode === "history" || mode === "all") {
    return `You have ${total} task record${total === 1 ? "" : "s"}: ${completed} completed, ${pending} pending, ${inProgress} in progress, and ${overdue} overdue.`;
  }
  return result.message;
}
function knownIntent(user: AgentUser, message: string): KnownIntent | null {
  const normalized = message.toLowerCase().replace(/[’]/g, "'");
  if (user.role === "employee") {
    const historyQuery = /\b(task history|history of my tasks|tasks? before|previous tasks|past tasks)\b/.test(normalized);
    const completedToday = /\b(completed|finished)\b/.test(normalized) && /\btoday\b/.test(normalized);
    const completedQuery = /\b(completed|finished)\b/.test(normalized);
    const pendingQuery = /\bpending\b/.test(normalized);
    const inProgressQuery = /\bin progress\b/.test(normalized);
    const overdueQuery = /\boverdue|late tasks?\b/.test(normalized);
    const assignedToday = /\bassigned\b/.test(normalized) && /\btoday\b/.test(normalized);
    const todayQuery = /\btoday\b/.test(normalized) || /\bwhat should i work on\b/.test(normalized) || /\bam i free today\b/.test(normalized);
    const taskQuery = todayQuery || historyQuery || pendingQuery || inProgressQuery || overdueQuery || completedQuery || /\b(any tasks?|my tasks|assigned tasks|tasks assigned to me|list my tasks|show my tasks|what(?: are)? my tasks|tasks? do i have|do i have(?: any)? tasks?|what .*?tasks? do i have)\b/.test(normalized);
    if (taskQuery) {
      if (!hasAnyPermission(user, ["TASKS_VIEW_MY", "TASKS_VIEW_DEPARTMENT", "TASKS_VIEW_ALL"])) {
        return { text: "You do not currently have permission to view tasks. Please ask your administrator to enable task access." };
      }
      if (!user.employeeId) return { text: "Your account isn't linked to an employee record, so I can't identify your assigned tasks." };
      const args: Record<string, unknown> = { assignedTo: user.employeeId, limit: historyQuery ? 50 : 20 };
      if (assignedToday) args.assignedToday = true;
      else if (completedToday) args.completedToday = true;
      else if (pendingQuery) args.status = "Pending";
      else if (inProgressQuery) args.status = "In Progress";
      else if (overdueQuery) args.due = "overdue";
      else if (completedQuery) args.status = "Completed";
      else if (todayQuery) args.due = "today";
      const taskMode = assignedToday ? "assignedToday" : completedToday ? "completedToday" : pendingQuery ? "pending" : inProgressQuery ? "inProgress" : overdueQuery ? "overdue" : completedQuery ? "completed" : historyQuery ? "history" : todayQuery ? "today" : "all";
      return { tool: "list_tasks", args, taskMode };
    }
    if (/\b(my weekly report|weekly performance|my performance|performance report)\b/.test(normalized)) {
      if (!hasPermission(user, "PERFORMANCE_VIEW_MY")) {
        return { text: "You do not currently have permission to view your performance report. Please ask your administrator to enable performance access." };
      }
      return { tool: "get_performance", args: {} };
    }
    if (/\bmark .*task.*(done|complete)|\bcomplete .*task\b/.test(normalized)) {
      const id = message.match(/\bTASK-\d+\b/i)?.[0];
      if (!id) return { text: "Which task ID should I mark complete? I can only update a task that is visible to your account." };
      if (!hasPermission(user, "TASKS_COMPLETE")) return { text: "You do not currently have permission to complete tasks. Please ask your administrator to enable task completion." };
      return { tool: "complete_task", args: { taskId: id } };
    }
    if (/\b(permission|permissions)\b/.test(normalized) && /\b(show|view|list|grant|give|assign|remove|revoke|edit|change)\b/.test(normalized)) {
      return { text: "Employee permissions can only be viewed or changed by an administrator." };
    }
    if (/\b(department)\b/.test(normalized) && /\b(create|add|rename|update|edit|change|delete|remove)\b/.test(normalized)) {
      return { text: "Department records can only be created or changed by an administrator." };
    }
    if (/\b(employee|employee record|employee details)\b/.test(normalized) && /\b(create|add|edit|update|change)\b/.test(normalized)) {
      return { text: "Employee records can only be created or changed by an administrator. Ask an administrator if your own profile needs updating." };
    }
    return null;
  }

  const target = message.match(/^\s*(?:does|show|list|what(?: is| are)?)\s+(.+?)\s+(?:have|has|task|tasks|task history)/i)?.[1]
    ?? message.match(/^\s*(?:show|list)\s+(.+?)(?:['’]s)\s+(?:task|tasks|history)/i)?.[1]
    ?? message.match(/\bassigned to\s+(.+?)(?:[?.!]|$)/i)?.[1];
  const taskQuestion = /\b(task|tasks|task history|task records)\b/i.test(normalized);
  if (taskQuestion && target) {
    const args: Record<string, unknown> = { assignee: target.trim(), limit: 50 };
    if (/\b(today|due today)\b/.test(normalized)) args.due = "today";
    else if (/\bpending\b/.test(normalized)) args.status = "Pending";
    else if (/\bin progress\b/.test(normalized)) args.status = "In Progress";
    else if (/\boverdue\b/.test(normalized)) args.due = "overdue";
    else if (/\bcompleted|finished\b/.test(normalized)) args.status = "Completed";
    return { tool: "list_tasks", args };
  }
  if (/\b(list|show|view|search|find)\b/.test(normalized) && /\b(departments?|teams)\b/.test(normalized)) return { tool: "list_departments", args: {} };
  if (/\b(list|show|view|search|find)\b/.test(normalized) && /\b(employees?|staff|team members)\b/.test(normalized)) return { tool: "search_employees", args: {} };
  if (/\b(how many|kitne|kitna|count|total|exist|existing|registered)\b/.test(normalized) && /\b(employee|employees|staff|team members)\b/.test(normalized)) return { tool: "search_employees", args: { limit: 200 } };
  if (/\b(how many|kitne|kitna|count|total|exist|existing)\b/.test(normalized) && /\b(department|departments|teams)\b/.test(normalized)) return { tool: "list_departments", args: { limit: 200 } };
  if (/\b(how many|kitne|kitna|count|total|exist|existing|any|what)\b/.test(normalized) && /\b(task|tasks|pending|completed|overdue)\b/.test(normalized)) {
    const status = /\bpending\b/.test(normalized) ? "Pending" : /\bin progress\b/.test(normalized) ? "In Progress" : /\bcompleted|finished\b/.test(normalized) ? "Completed" : undefined;
    return { tool: "list_tasks", args: status ? { status } : {} };
  }
  if (/\b(list|show|view|find|which|what)\b/.test(normalized) && /\b(tasks?|overdue|pending)\b/.test(normalized)) {
    const status = /\bpending\b/.test(normalized) ? "Pending" : /\bin progress\b/.test(normalized) ? "In Progress" : undefined;
    return { tool: "list_tasks", args: status ? { status } : {} };
  }
  if (/\b(performance|completion rate|team report|analytics)\b/.test(normalized)) return { tool: "get_performance", args: {} };
  if (/\b(add|create|register)\b/.test(normalized) && /\b(employee|staff member)\b/.test(normalized)) return { tool: "propose_create_employee", args: {} };
  if (/\b(create|add)\b/.test(normalized) && /\bdepartment\b/.test(normalized)) {
    const name = message.match(/\b(?:named|called)\s+(.+?)(?:[.!?]|$)/i)?.[1]?.trim();
    return name ? { tool: "propose_create_department", args: { departmentName: name } } : { text: "What should the new department be named?" };
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
  let lastEmployeeTaskResult: ToolExecutionResult | null = null;
  const internalTokens = tools.flatMap((definition) => [definition.function.name]);

  for (let iteration = 0; iteration < 4; iteration += 1) {
    const assistant = await callProvider(config.apiKey, config.baseUrl, config.model, history, tools);
    lastAssistant = assistant;

    if (!assistant.tool_calls?.length) {
      if (user.role === "employee" && lastEmployeeTaskResult) {
        const intent = knownIntent(user, messageText(messages[messages.length - 1]));
        if (intent?.taskMode) {
          return { parts: [...parts, { type: "text", text: employeeTaskReply(intent.taskMode, lastEmployeeTaskResult) }] };
        }
      }
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
          const responseText = intent.taskMode ? employeeTaskReply(intent.taskMode, result) : result.message;
          return { parts: [toolResult, { type: "text", text: responseText }] };
        }
      }
      const text = assistant.content?.trim() ?? "";
      if (text) {
        parts.push({ type: "text", text: stripInternalMentions(text, internalTokens) });
      }
      if (!parts.length) {
        parts.push({ type: "text", text: "I couldn't determine how to help with that request. Could you rephrase it or tell me which module you're asking about (employees, departments, tasks, or performance)?" });
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
      if (user.role === "employee" && call.function.name === "list_tasks") lastEmployeeTaskResult = result;
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

