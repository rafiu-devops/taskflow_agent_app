export type Role = "admin" | "employee";

export type Suggestion = { id: string; label: string; prompt: string; roles: Role[] };

export const SUGGESTIONS: Suggestion[] = [
  { id: "due-today", label: "What's due today?", prompt: "Show my tasks for today", roles: ["employee", "admin"] },
  { id: "mark-done", label: "Mark a task done", prompt: "I want to mark a task as done", roles: ["employee"] },
  { id: "weekly", label: "My weekly report", prompt: "Show my weekly performance report", roles: ["employee"] },
  { id: "assign", label: "Assign a task", prompt: "Assign a task", roles: ["admin"] },
  { id: "overdue", label: "Who's overdue?", prompt: "Which employees have overdue tasks?", roles: ["admin"] },
  { id: "team-perf", label: "Team performance", prompt: "Show team performance this week", roles: ["admin"] },
];

export function suggestionsForRole(role: Role): Suggestion[] {
  return SUGGESTIONS.filter((suggestion) => suggestion.roles.includes(role));
}
