import type { TaskStatus, TaskSummary } from "@/types/agent";

export type DashboardTaskStatus = TaskStatus;

export function normalizeTaskStatus(value: unknown): DashboardTaskStatus {
  const normalized = String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (normalized === "completed" || normalized === "complete") return "Completed";
  if (normalized === "in progress" || normalized === "in-progress" || normalized === "inprogress") return "In Progress";
  if (normalized === "overdue") return "Overdue";
  return "Pending";
}

export function todayUtcDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isTaskCompleted(task: { status: unknown }): boolean {
  return normalizeTaskStatus(task.status) === "Completed";
}

export function isTaskOverdue(task: { status: unknown; dueDate?: string | null }, today = todayUtcDateOnly()): boolean {
  if (isTaskCompleted(task)) return false;
  const due = String(task.dueDate ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(due) && due < today;
}

export function taskCategory(task: { status: unknown; dueDate?: string | null }, today = todayUtcDateOnly()): DashboardTaskStatus {
  const status = normalizeTaskStatus(task.status);
  if (status === "Completed") return "Completed";
  if (status === "Overdue" || isTaskOverdue(task, today)) return "Overdue";
  if (status === "In Progress") return "In Progress";
  return "Pending";
}

export function sortRecent(a: TaskSummary, b: TaskSummary): number {
  const aTime = Date.parse((a as unknown as { updatedAt?: string; createdAt?: string }).updatedAt ?? (a as unknown as { createdAt?: string }).createdAt ?? "") || 0;
  const bTime = Date.parse((b as unknown as { updatedAt?: string; createdAt?: string }).updatedAt ?? (b as unknown as { createdAt?: string }).createdAt ?? "") || 0;
  return bTime - aTime;
}

export function compareTaskDate(a?: string | null, b?: string | null): number {
  const left = String(a ?? "9999-12-31").slice(0, 10);
  const right = String(b ?? "9999-12-31").slice(0, 10);
  return left.localeCompare(right);
}
