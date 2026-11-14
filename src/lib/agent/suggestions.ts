export type Role = "admin" | "employee";

export type Suggestion = { id: string; label: string; prompt: string; roles: Role[] };

export const SUGGESTIONS: Suggestion[] = [
  { id: "due-today", label: "What's due today?", prompt: "Show my tasks for today", roles: ["employee", "admin"] },
  { id: "mark-done", label: "Mark a task done", prompt: "I want to mark a task as done", roles: ["employee"] },
  { id: "weekly", label: "My weekly report", prompt: "Show my weekly performance report", roles: ["employee"] },
  { id: "assign", label: "Assign a task", prompt: "Assign a task", roles: ["admin"] },
  { id: "overdue", label: "Who's overdue?", prompt: "Which employees have overdue tasks?", roles: ["admin"] },
  { id: "team-perf", label: "Team performance", prompt: "Show team performance this week", roles: ["admin"] },
  { id: "add-employee", label: "Add an employee", prompt: "I want to add an employee", roles: ["admin"] },
];

import type { AgentUser } from "@/types/agent";

export function suggestionsForUser(user: AgentUser): Suggestion[] {
  return SUGGESTIONS.filter((suggestion) => {
    if (!suggestion.roles.includes(user.role)) return false;
    if (suggestion.id === "due-today") return user.role === "admin" || ["TASKS_VIEW_MY", "TASKS_VIEW_DEPARTMENT", "TASKS_VIEW_ALL"].some((key) => user.permissions[key]);
    if (suggestion.id === "mark-done") return Boolean(user.permissions.TASKS_COMPLETE);
    if (suggestion.id === "weekly") return Boolean(user.permissions.PERFORMANCE_VIEW_MY);
    return true;
  });
}
