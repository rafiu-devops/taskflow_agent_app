import "server-only";
import { z } from "zod";
import { managementJson } from "@/lib/auth/server";
import { hasPermission } from "@/lib/permissions";
import {
  compareTaskDate,
  isTaskOverdue,
  normalizeTaskStatus,
  sortRecent,
  todayUtcDateOnly,
} from "@/lib/tasks";
import type {
  AgentUser,
  ChatCard,
  ChatConfirmationCard,
  ChatDepartmentsCard,
  ChatEmployeesCard,
  ChatPerformanceCard,
  ChatTaskCard,
  DepartmentSummary,
  EmployeeSummary,
  TaskSummary,
} from "@/types/agent";

export interface ToolExecutionResult {
  ok: boolean;
  message: string;
  data?: unknown;
  card?: ChatCard;
  permissionRequired?: string;
}

interface ToolContext {
  user: AgentUser;
}

type ToolHandler = (args: Record<string, unknown>, context: ToolContext) => Promise<ToolExecutionResult>;

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const isoDate = z.string().regex(datePattern, "Use YYYY-MM-DD");

const listTasksSchema = z.object({
  search: z.string().optional(),
  status: z.enum(["Pending", "In Progress", "Completed", "Overdue"]).optional(),
  priority: z.enum(["Low", "Medium", "High", "Urgent"]).optional(),
  departmentId: z.string().optional(),
  department: z.string().optional(),
  assignee: z.string().optional(),
  assignedTo: z.string().optional(),
  due: z.enum(["today", "overdue"]).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

const searchEmployeesSchema = z.object({
  search: z.string().optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

const listDepartmentsSchema = z.object({
  search: z.string().optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  assignedTo: z.string().optional(),
  assignee: z.string().optional(),
  departmentId: z.string().optional(),
  department: z.string().optional(),
  priority: z.enum(["Low", "Medium", "High", "Urgent"]).optional(),
  dueDate: isoDate.optional(),
  remarks: z.string().max(2000).optional(),
});

const updateTaskSchema = z.object({
  taskId: z.string().min(1),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  assignedTo: z.string().optional(),
  assignee: z.string().optional(),
  departmentId: z.string().optional(),
  department: z.string().optional(),
  priority: z.enum(["Low", "Medium", "High", "Urgent"]).optional(),
  status: z.enum(["Pending", "In Progress", "Completed"]).optional(),
  dueDate: isoDate.optional().nullable(),
  progressPercentage: z.number().min(0).max(100).optional(),
  remarks: z.string().max(2000).optional().nullable(),
});

const completeTaskSchema = z.object({
  taskId: z.string().min(1),
});

const activityLogsSchema = z.object({
  limit: z.number().int().min(1).max(25).optional(),
});

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function taskSummary(task: Record<string, unknown>, names?: { employees?: Map<string, string>; departments?: Map<string, string> }): TaskSummary {
  const assignedTo = task.assignedTo ? String(task.assignedTo) : null;
  const departmentId = task.departmentId ? String(task.departmentId) : null;
  return {
    taskId: String(task.taskId ?? ""),
    title: String(task.title ?? ""),
    assignedTo,
    assignedName: assignedTo ? names?.employees?.get(assignedTo) ?? null : null,
    departmentId,
    departmentName: departmentId ? names?.departments?.get(departmentId) ?? null : null,
    priority: (task.priority as TaskSummary["priority"]) ?? null,
    status: (task.status as TaskSummary["status"]) ?? null,
    dueDate: task.dueDate ? String(task.dueDate) : null,
    completionDate: task.completionDate ? String(task.completionDate) : null,
    progressPercentage: typeof task.progressPercentage === "number" ? task.progressPercentage : Number(task.progressPercentage ?? 0) || 0,
    remarks: task.remarks ? String(task.remarks) : null,
  };
}

async function employeesForUser(user: AgentUser): Promise<EmployeeSummary[] | null> {
  if (!hasPermission(user, "EMPLOYEES_VIEW_DIRECTORY")) return null;
  const result = await managementJson<{ employees: EmployeeSummary[] }>("/api/employees");
  if (!result.ok || !result.data) return null;
  return result.data.employees ?? [];
}

async function departmentsForUser(user: AgentUser): Promise<DepartmentSummary[] | null> {
  if (!hasPermission(user, "DEPARTMENTS_VIEW")) return null;
  const result = await managementJson<{ departments: DepartmentSummary[] }>("/api/departments");
  if (!result.ok || !result.data) return null;
  return result.data.departments ?? [];
}

function employeeNameMap(employees: EmployeeSummary[] | null): Map<string, string> {
  return new Map((employees ?? []).map((employee) => [employee.employeeId, employee.fullName || employee.employeeId]));
}

function departmentNameMap(departments: DepartmentSummary[] | null): Map<string, string> {
  return new Map((departments ?? []).map((department) => [department.departmentId, department.departmentName || department.departmentId]));
}

async function resolveEmployee(user: AgentUser, query: string): Promise<{ employee?: EmployeeSummary; candidates?: EmployeeSummary[]; error?: string }> {
  const q = query.trim().toLowerCase();
  if (!q) return { error: "Missing employee." };
  if (/^emp-\d+$/i.test(query.trim())) {
    const employeeId = query.trim().toUpperCase();
    const employees = await employeesForUser(user);
    if (!employees) {
      // Without directory access, pass a syntactically valid ID to the backend; it validates existence.
      return { employee: { employeeId, fullName: employeeId, email: null, departmentId: null, designation: null, accountStatus: null } };
    }
    const exact = employees.find((employee) => employee.employeeId.toLowerCase() === q);
    return exact ? { employee: exact } : { error: `No employee found with ID ${employeeId}.` };
  }
  const employees = await employeesForUser(user);
  if (!employees) return { error: "You do not have permission to look up employees." };
  const exact = employees.filter((employee) => [employee.employeeId, employee.email ?? ""].map((value) => value.toLowerCase()).includes(q));
  if (exact.length === 1) return { employee: exact[0] };
  const matches = employees.filter((employee) =>
    [employee.fullName, employee.email ?? "", employee.employeeId, employee.departmentId ?? ""].join(" ").toLowerCase().includes(q),
  );
  if (matches.length === 1) return { employee: matches[0] };
  if (matches.length > 1) return { candidates: matches.slice(0, 5) };
  return { error: `No employee matched "${query}".` };
}

async function resolveDepartment(user: AgentUser, query: string): Promise<{ department?: DepartmentSummary; candidates?: DepartmentSummary[]; error?: string }> {
  const q = query.trim().toLowerCase();
  if (!q) return { error: "Missing department." };
  const departments = await departmentsForUser(user);
  if (!departments) return { error: "You do not have permission to look up departments." };
  if (/^dep-\d+$/i.test(query.trim()) || /^dept-\d+$/i.test(query.trim())) {
    const exact = departments.find((department) => department.departmentId.toLowerCase() === q);
    return exact ? { department: exact } : { error: `No department found with ID ${query.trim()}.` };
  }
  const exact = departments.filter((department) => department.departmentName.toLowerCase() === q);
  if (exact.length === 1) return { department: exact[0] };
  const matches = departments.filter((department) => [department.departmentId, department.departmentName, department.manager ?? ""].join(" ").toLowerCase().includes(q));
  if (matches.length === 1) return { department: matches[0] };
  if (matches.length > 1) return { candidates: matches.slice(0, 5) };
  return { error: `No department matched "${query}".` };
}

async function findTask(user: AgentUser, taskId: string): Promise<TaskSummary | null> {
  const result = await managementJson<{ tasks: Record<string, unknown>[] }>("/api/tasks");
  if (!result.ok || !result.data) return null;
  const [employees, departments] = await Promise.all([employeesForUser(user), departmentsForUser(user)]);
  const names = { employees: employeeNameMap(employees), departments: departmentNameMap(departments) };
  const match = (result.data.tasks ?? []).find((task) => String(task.taskId).toLowerCase() === taskId.trim().toLowerCase());
  return match ? taskSummary(match, names) : null;
}

async function listTasks(user: AgentUser, rawArgs: unknown): Promise<ToolExecutionResult> {
  const args = listTasksSchema.parse(asRecord(rawArgs));
  const [employees, departments, result] = await Promise.all([
    employeesForUser(user),
    departmentsForUser(user),
    managementJson<{ tasks: Record<string, unknown>[]; scope?: string }>("/api/tasks"),
  ]);
  if (!result.ok || !result.data) {
    return { ok: false, permissionRequired: "TASKS_VIEW_MY | TASKS_VIEW_DEPARTMENT | TASKS_VIEW_ALL", message: result.status === 403 ? "You do not have permission to view tasks." : "Unable to load tasks." };
  }
  const names = { employees: employeeNameMap(employees), departments: departmentNameMap(departments) };
  let tasks = (result.data.tasks ?? []).map((task) => taskSummary(task, names));
  const today = todayUtcDateOnly();

  const departmentQuery = args.departmentId ?? args.department;
  if (departmentQuery) {
    const resolved = await resolveDepartment(user, departmentQuery);
    if (!resolved.department) return { ok: false, message: resolved.error ?? "Department not found or ambiguous.", data: resolved.candidates };
    tasks = tasks.filter((task) => task.departmentId === resolved.department!.departmentId);
  }

  const assigneeQuery = args.assignedTo ?? args.assignee;
  if (assigneeQuery) {
    const resolved = await resolveEmployee(user, assigneeQuery);
    if (!resolved.employee) return { ok: false, message: resolved.error ?? "Employee not found or ambiguous.", data: resolved.candidates };
    tasks = tasks.filter((task) => task.assignedTo === resolved.employee!.employeeId);
  }

  if (args.search) {
    const query = args.search.toLowerCase();
    tasks = tasks.filter((task) =>
      [task.taskId, task.title, task.assignedName ?? "", task.assignedTo ?? ""].join(" ").toLowerCase().includes(query),
    );
  }
  if (args.status) {
    tasks = tasks.filter((task) =>
      args.status === "Overdue" ? isTaskOverdue(task, today) : normalizeTaskStatus(task.status) === args.status,
    );
  }
  if (args.priority) tasks = tasks.filter((task) => String(task.priority) === args.priority);
  if (args.due === "today") tasks = tasks.filter((task) => String(task.dueDate ?? "").slice(0, 10) === today);
  if (args.due === "overdue") tasks = tasks.filter((task) => isTaskOverdue(task, today));

  tasks.sort((a, b) => sortRecent(a, b) || compareTaskDate(a.dueDate, b.dueDate));
  const limit = args.limit ?? 20;
  const limited = tasks.slice(0, limit);
  const card: ChatTaskCard = {
    type: "tasks",
    title: args.status ? `${args.status} tasks` : args.due === "today" ? "Today's tasks" : args.due === "overdue" ? "Overdue tasks" : "Tasks",
    subtitle: `Showing ${limited.length} of ${tasks.length} result${tasks.length === 1 ? "" : "s"}`,
    tasks: limited,
    total: tasks.length,
    emptyMessage: "No tasks match those filters.",
  };
  return { ok: true, message: `Found ${tasks.length} task${tasks.length === 1 ? "" : "s"}.`, data: { total: tasks.length, tasks: limited }, card };
}

async function searchEmployees(user: AgentUser, rawArgs: unknown): Promise<ToolExecutionResult> {
  const args = searchEmployeesSchema.parse(asRecord(rawArgs));
  if (!hasPermission(user, "EMPLOYEES_VIEW_DIRECTORY")) {
    return { ok: false, permissionRequired: "EMPLOYEES_VIEW_DIRECTORY", message: "You do not have permission to view the employee directory." };
  }
  const [employees, departments] = await Promise.all([employeesForUser(user), departmentsForUser(user)]);
  const names = departmentNameMap(departments);
  const query = args.search?.trim().toLowerCase() ?? "";
  const filtered = (employees ?? []).filter((employee) => {
    if (!query) return true;
    return [employee.fullName, employee.email ?? "", employee.employeeId, employee.departmentId ?? "", employee.designation ?? ""].join(" ").toLowerCase().includes(query);
  });
  const limited = filtered.slice(0, args.limit ?? 20).map((employee) => ({
    ...employee,
    departmentName: employee.departmentId ? names.get(employee.departmentId) ?? null : null,
  }));
  const card: ChatEmployeesCard = {
    type: "employees",
    title: query ? `Employees matching “${args.search}”` : "Employees",
    employees: limited,
    total: filtered.length,
    emptyMessage: "No employees matched.",
  };
  return { ok: true, message: `Found ${filtered.length} employee${filtered.length === 1 ? "" : "s"}.`, data: { total: filtered.length, employees: limited }, card };
}

async function listDepartments(user: AgentUser, rawArgs: unknown): Promise<ToolExecutionResult> {
  const args = listDepartmentsSchema.parse(asRecord(rawArgs));
  if (!hasPermission(user, "DEPARTMENTS_VIEW")) {
    return { ok: false, permissionRequired: "DEPARTMENTS_VIEW", message: "You do not have permission to view departments." };
  }
  const departments = await departmentsForUser(user);
  const query = args.search?.trim().toLowerCase() ?? "";
  const filtered = (departments ?? []).filter((department) => {
    if (!query) return true;
    return [department.departmentId, department.departmentName, department.description ?? "", department.manager ?? ""].join(" ").toLowerCase().includes(query);
  });
  const limited = filtered.slice(0, args.limit ?? 20);
  const card: ChatDepartmentsCard = {
    type: "departments",
    title: query ? "Departments" : "Departments",
    departments: limited,
    emptyMessage: "No departments matched.",
  };
  return { ok: true, message: `Found ${filtered.length} department${filtered.length === 1 ? "" : "s"}.`, data: { total: filtered.length, departments: limited }, card };
}

async function getDashboard(user: AgentUser): Promise<ToolExecutionResult> {
  if (!hasPermission(user, "DASHBOARD_VIEW_PERSONAL")) {
    return { ok: false, permissionRequired: "DASHBOARD_VIEW_PERSONAL", message: "You do not have permission to view dashboard data." };
  }
  const result = await managementJson<Record<string, unknown>>("/api/dashboard");
  if (!result.ok || !result.data) {
    return { ok: false, message: result.status === 403 ? "You do not have permission to view dashboard data." : "Unable to load dashboard data." };
  }
  const data = result.data;
  const summary = (data as { summary?: Record<string, unknown> | null }).summary ?? null;
  const kpis = (data as { kpis?: Record<string, unknown> }).kpis ?? null;
  if (user.role === "admin" && kpis) {
    const metrics = [
      { label: "Total tasks", value: String(kpis.totalTasks ?? 0) },
      { label: "Completed", value: String(kpis.completedTasks ?? 0) },
      { label: "Pending", value: String(kpis.pendingTasks ?? 0) },
      { label: "In progress", value: String(kpis.inProgressTasks ?? 0) },
      { label: "Overdue", value: String(kpis.overdueTasks ?? 0) },
      { label: "Completion rate", value: `${kpis.overallCompletionRate ?? 0}%` },
      { label: "On-time rate", value: `${kpis.onTimeCompletionRate ?? 0}%` },
    ];
    const card: ChatPerformanceCard = { type: "performance", title: "Organization performance", metrics };
    return { ok: true, message: "Loaded organization dashboard metrics.", data, card };
  }
  if (summary) {
    const metrics = [
      { label: "Total tasks", value: String(summary.totalTasks ?? 0) },
      { label: "Completed", value: String(summary.completedTasks ?? 0) },
      { label: "Pending", value: String(summary.pendingTasks ?? 0) },
      { label: "Overdue", value: String(summary.overdueTasks ?? 0) },
    ];
    const card: ChatPerformanceCard = { type: "performance", title: "My dashboard", metrics };
    return { ok: true, message: "Loaded your dashboard summary.", data, card };
  }
  return { ok: true, message: "Dashboard is available but task statistics are not granted for this account.", data, card: { type: "notice", tone: "info", message: "Task statistics are not granted for your account." } };
}

async function getPerformance(user: AgentUser): Promise<ToolExecutionResult> {
  if (!hasAnyPermissionUser(user, ["PERFORMANCE_VIEW_MY", "PERFORMANCE_VIEW_DEPARTMENT", "PERFORMANCE_VIEW_ALL"])) {
    return { ok: false, permissionRequired: "PERFORMANCE_VIEW_MY | PERFORMANCE_VIEW_DEPARTMENT | PERFORMANCE_VIEW_ALL", message: "You do not have permission to view performance data." };
  }
  const result = await managementJson<{ performance: Array<Record<string, unknown>>; scope?: string }>("/api/performance");
  if (!result.ok || !result.data) {
    return { ok: false, message: result.status === 403 ? "You do not have permission to view performance data." : "Unable to load performance data." };
  }
  const rows = result.data.performance ?? [];
  const assigned = rows.reduce((sum, row) => sum + Number(row.totalAssignedTasks ?? 0), 0);
  const completed = rows.reduce((sum, row) => sum + Number(row.completedTasks ?? 0), 0);
  const overdue = rows.reduce((sum, row) => sum + Number(row.overdueTasks ?? 0), 0);
  const completionRate = assigned ? Math.round((completed / assigned) * 1000) / 10 : 0;
  const metrics = [
    { label: "Assigned tasks", value: String(assigned) },
    { label: "Completed", value: String(completed) },
    { label: "Overdue", value: String(overdue) },
    { label: "Completion rate", value: `${completionRate}%` },
  ];
  const card: ChatPerformanceCard = {
    type: "performance",
    title: result.data.scope === "own" ? "My performance" : result.data.scope === "department" ? "Department performance" : "Performance report",
    metrics,
    rows: rows.slice(0, 10).map((row) => ({
      name: String(row.employeeName ?? row.employeeId ?? "Unknown"),
      assigned: Number(row.totalAssignedTasks ?? 0),
      completed: Number(row.completedTasks ?? 0),
      overdue: Number(row.overdueTasks ?? 0),
      completionRate: Number(row.completionRate ?? 0),
    })),
  };
  return { ok: true, message: `Loaded ${rows.length} performance row${rows.length === 1 ? "" : "s"}.`, data: result.data, card };
}

function hasAnyPermissionUser(user: AgentUser, permissions: readonly string[]): boolean {
  return permissions.some((permission) => hasPermission(user, permission));
}

async function getActivityLogs(user: AgentUser, rawArgs: unknown): Promise<ToolExecutionResult> {
  const args = activityLogsSchema.parse(asRecord(rawArgs));
  if (!hasAnyPermissionUser(user, ["ACTIVITY_LOGS_VIEW", "ACTIVITY_LOGS_VIEW_MY"])) {
    return { ok: false, permissionRequired: "ACTIVITY_LOGS_VIEW | ACTIVITY_LOGS_VIEW_MY", message: "You do not have permission to view activity logs." };
  }
  const result = await managementJson<{ logs: Array<Record<string, unknown>>; scope?: string }>("/api/activity-logs");
  if (!result.ok || !result.data) {
    return { ok: false, message: result.status === 403 ? "You do not have permission to view activity logs." : "Unable to load activity logs." };
  }
  const logs = (result.data.logs ?? []).slice(0, args.limit ?? 10);
  return { ok: true, message: `Loaded ${logs.length} recent log entr${logs.length === 1 ? "y" : "ies"}.`, data: { scope: result.data.scope, logs } };
}

async function createTask(user: AgentUser, rawArgs: unknown): Promise<ToolExecutionResult> {
  const args = createTaskSchema.parse(asRecord(rawArgs));
  if (!hasPermission(user, "TASKS_CREATE")) {
    return { ok: false, permissionRequired: "TASKS_CREATE", message: "You do not have permission to create tasks." };
  }

  const payload: Record<string, unknown> = {
    title: args.title,
    description: args.description ?? null,
    priority: args.priority ?? "Medium",
  };
  if (args.dueDate) payload.dueDate = args.dueDate;
  if (args.remarks) payload.remarks = args.remarks;

  const assignee = args.assignedTo ?? args.assignee;
  if (assignee) {
    const resolved = await resolveEmployee(user, assignee);
    if (!resolved.employee) {
      return { ok: false, message: resolved.error ?? "Employee not found or ambiguous.", data: resolved.candidates, permissionRequired: resolved.error ? undefined : "EMPLOYEES_VIEW_DIRECTORY" };
    }
    if (user.role !== "admin" && !hasPermission(user, "TASKS_ASSIGN") && resolved.employee.employeeId !== user.employeeId) {
      return { ok: false, permissionRequired: "TASKS_ASSIGN", message: "You do not have permission to assign tasks to other employees." };
    }
    payload.assignedTo = resolved.employee.employeeId;
    if (!args.departmentId && resolved.employee.departmentId) payload.departmentId = resolved.employee.departmentId;
  } else if (user.role !== "admin") {
    payload.assignedTo = user.employeeId;
    if (user.departmentId) payload.departmentId = user.departmentId;
  }

  const departmentQuery = args.departmentId ?? args.department;
  if (departmentQuery) {
    if (/^dep-\d+$/i.test(departmentQuery)) {
      payload.departmentId = departmentQuery.toUpperCase();
    } else {
      const resolved = await resolveDepartment(user, departmentQuery);
      if (!resolved.department) return { ok: false, message: resolved.error ?? "Department not found or ambiguous.", data: resolved.candidates };
      payload.departmentId = resolved.department.departmentId;
    }
  }

  if (user.role !== "admin" && !hasPermission(user, "TASKS_CHANGE_PRIORITY") && args.priority && args.priority !== "Medium") {
    return { ok: false, permissionRequired: "TASKS_CHANGE_PRIORITY", message: "You do not have permission to set task priority." };
  }

  const created = await managementJson<{ task: Record<string, unknown> }>("/api/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!created.ok || !created.data) {
    const message = (created.data as { error?: string } | null)?.error;
    return { ok: false, message: message ?? (created.status === 403 ? "You do not have permission to create this task." : "Unable to create the task.") };
  }
  const [employees, departments] = await Promise.all([employeesForUser(user), departmentsForUser(user)]);
  const task = taskSummary(created.data.task, { employees: employeeNameMap(employees), departments: departmentNameMap(departments) });
  const card: ChatConfirmationCard = {
    type: "confirmation",
    title: "Task created",
    message: `Task ${task.taskId} was created.`,
    operation: "create_task",
    task,
    timestamp: new Date().toISOString(),
  };
  return { ok: true, message: `Created task ${task.taskId}.`, data: { task }, card };
}

async function updateTask(user: AgentUser, rawArgs: unknown): Promise<ToolExecutionResult> {
  const args = updateTaskSchema.parse(asRecord(rawArgs));
  const existing = await findTask(user, args.taskId);
  if (!existing) return { ok: false, message: "Task not found or not visible to you." };

  if (user.role !== "admin") {
    if (args.title !== undefined || args.description !== undefined || args.dueDate !== undefined) {
      if (!hasPermission(user, "TASKS_EDIT")) return { ok: false, permissionRequired: "TASKS_EDIT", message: "You do not have permission to edit task details." };
    }
    if (args.priority !== undefined && !hasPermission(user, "TASKS_CHANGE_PRIORITY")) {
      return { ok: false, permissionRequired: "TASKS_CHANGE_PRIORITY", message: "You do not have permission to change task priority." };
    }
    if (args.status !== undefined && !hasAnyPermissionUser(user, ["TASKS_CHANGE_STATUS", "TASKS_COMPLETE"])) {
      return { ok: false, permissionRequired: "TASKS_CHANGE_STATUS", message: "You do not have permission to change task status." };
    }
    if (args.status === "Completed" && !hasPermission(user, "TASKS_COMPLETE")) {
      return { ok: false, permissionRequired: "TASKS_COMPLETE", message: "You do not have permission to complete tasks." };
    }
    if (args.progressPercentage !== undefined && !hasPermission(user, "TASKS_UPDATE_PROGRESS")) {
      return { ok: false, permissionRequired: "TASKS_UPDATE_PROGRESS", message: "You do not have permission to update task progress." };
    }
    if (args.remarks !== undefined && !hasPermission(user, "TASKS_ADD_REMARKS")) {
      return { ok: false, permissionRequired: "TASKS_ADD_REMARKS", message: "You do not have permission to add task remarks." };
    }
    if ((args.assignedTo !== undefined || args.assignee !== undefined || args.departmentId !== undefined || args.department !== undefined) && !hasPermission(user, "TASKS_ASSIGN")) {
      return { ok: false, permissionRequired: "TASKS_ASSIGN", message: "You do not have permission to change assignments." };
    }
  }

  const payload: Record<string, unknown> = {};
  if (args.title !== undefined) payload.title = args.title;
  if (args.description !== undefined) payload.description = args.description;
  if (args.priority !== undefined) payload.priority = args.priority;
  if (args.status !== undefined) payload.status = args.status;
  if (args.dueDate !== undefined) payload.dueDate = args.dueDate;
  if (args.progressPercentage !== undefined) payload.progressPercentage = args.progressPercentage;
  if (args.remarks !== undefined) payload.remarks = args.remarks;

  const assignee = args.assignedTo ?? args.assignee;
  if (assignee !== undefined) {
    const resolved = await resolveEmployee(user, assignee);
    if (!resolved.employee) return { ok: false, message: resolved.error ?? "Employee not found or ambiguous.", data: resolved.candidates };
    payload.assignedTo = resolved.employee.employeeId;
  }
  const departmentQuery = args.departmentId ?? args.department;
  if (departmentQuery !== undefined) {
    if (/^dep-\d+$/i.test(departmentQuery)) {
      payload.departmentId = departmentQuery.toUpperCase();
    } else {
      const resolved = await resolveDepartment(user, departmentQuery);
      if (!resolved.department) return { ok: false, message: resolved.error ?? "Department not found or ambiguous.", data: resolved.candidates };
      payload.departmentId = resolved.department.departmentId;
    }
  }

  const updated = await managementJson<{ task: Record<string, unknown> }>(`/api/tasks/${encodeURIComponent(existing.taskId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!updated.ok || !updated.data) {
    const message = (updated.data as { error?: string } | null)?.error;
    return { ok: false, message: message ?? (updated.status === 403 ? "You do not have permission to update this task." : updated.status === 404 ? "Task not found." : "Unable to update the task.") };
  }
  const [employees, departments] = await Promise.all([employeesForUser(user), departmentsForUser(user)]);
  const task = taskSummary(updated.data.task, { employees: employeeNameMap(employees), departments: departmentNameMap(departments) });
  const card: ChatConfirmationCard = {
    type: "confirmation",
    title: "Task updated",
    message: `Task ${task.taskId} was updated.`,
    operation: "update_task",
    task,
    timestamp: new Date().toISOString(),
  };
  return { ok: true, message: `Updated task ${task.taskId}.`, data: { task }, card };
}

async function completeTask(user: AgentUser, rawArgs: unknown): Promise<ToolExecutionResult> {
  const args = completeTaskSchema.parse(asRecord(rawArgs));
  if (user.role !== "admin" && !hasPermission(user, "TASKS_COMPLETE")) {
    return { ok: false, permissionRequired: "TASKS_COMPLETE", message: "You do not have permission to complete tasks." };
  }
  return updateTask(user, { taskId: args.taskId, status: "Completed" });
}

function tool(name: string, description: string, parameters: Record<string, unknown>) {
  return { type: "function" as const, function: { name, description, parameters } };
}

const objectSchema = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required,
});

export function buildToolDefinitions(user: AgentUser) {
  const tools: ReturnType<typeof tool>[] = [];
  if (hasAnyPermissionUser(user, ["TASKS_VIEW_MY", "TASKS_VIEW_DEPARTMENT", "TASKS_VIEW_ALL"])) {
    tools.push(tool("list_tasks", "List tasks visible to the user, optionally filtered by status, priority, department, assignee, due date or search text.", objectSchema({
      search: { type: "string", description: "Match task ID, title or assignee." },
      status: { type: "string", enum: ["Pending", "In Progress", "Completed", "Overdue"] },
      priority: { type: "string", enum: ["Low", "Medium", "High", "Urgent"] },
      department: { type: "string", description: "Department name or ID." },
      departmentId: { type: "string" },
      assignee: { type: "string", description: "Employee name, email or ID." },
      assignedTo: { type: "string" },
      due: { type: "string", enum: ["today", "overdue"] },
      limit: { type: "number", minimum: 1, maximum: 50 },
    })));
  }
  if (hasPermission(user, "EMPLOYEES_VIEW_DIRECTORY")) {
    tools.push(tool("search_employees", "Search the employee directory when permitted.", objectSchema({
      search: { type: "string" },
      limit: { type: "number", minimum: 1, maximum: 50 },
    })));
  }
  if (hasPermission(user, "DEPARTMENTS_VIEW")) {
    tools.push(tool("list_departments", "List departments visible to the user.", objectSchema({
      search: { type: "string" },
      limit: { type: "number", minimum: 1, maximum: 50 },
    })));
  }
  if (hasPermission(user, "DASHBOARD_VIEW_PERSONAL")) {
    tools.push(tool("get_dashboard", "Get the live dashboard summary (admin organization metrics or employee scoped summary).", objectSchema({})));
  }
  if (hasAnyPermissionUser(user, ["PERFORMANCE_VIEW_MY", "PERFORMANCE_VIEW_DEPARTMENT", "PERFORMANCE_VIEW_ALL"])) {
    tools.push(tool("get_performance", "Get performance metrics/rows visible to the user.", objectSchema({})));
  }
  if (hasAnyPermissionUser(user, ["ACTIVITY_LOGS_VIEW", "ACTIVITY_LOGS_VIEW_MY"])) {
    tools.push(tool("get_activity_logs", "Get recent activity/audit logs when permitted.", objectSchema({ limit: { type: "number", minimum: 1, maximum: 25 } })));
  }
  if (hasPermission(user, "TASKS_CREATE")) {
    tools.push(tool("create_task", "Create a task. Use only after enough information is available; never invent IDs.", objectSchema({
      title: { type: "string" },
      description: { type: "string" },
      assignedTo: { type: "string", description: "Employee ID, email or full name." },
      assignee: { type: "string" },
      departmentId: { type: "string" },
      department: { type: "string" },
      priority: { type: "string", enum: ["Low", "Medium", "High", "Urgent"] },
      dueDate: { type: "string", pattern: datePattern.source, description: "YYYY-MM-DD" },
      remarks: { type: "string" },
    }, ["title"])));
  }
  if (
    hasAnyPermissionUser(user, [
      "TASKS_EDIT",
      "TASKS_ASSIGN",
      "TASKS_CHANGE_PRIORITY",
      "TASKS_CHANGE_STATUS",
      "TASKS_COMPLETE",
      "TASKS_UPDATE_PROGRESS",
      "TASKS_ADD_REMARKS",
    ])
  ) {
    tools.push(tool("update_task", "Update a visible task with the fields the user is allowed to change.", objectSchema({
      taskId: { type: "string" },
      title: { type: "string" },
      description: { type: "string" },
      assignedTo: { type: "string", description: "Employee ID, email or full name." },
      assignee: { type: "string" },
      departmentId: { type: "string" },
      department: { type: "string" },
      priority: { type: "string", enum: ["Low", "Medium", "High", "Urgent"] },
      status: { type: "string", enum: ["Pending", "In Progress", "Completed"] },
      dueDate: { type: ["string", "null"], pattern: datePattern.source },
      progressPercentage: { type: "number", minimum: 0, maximum: 100 },
      remarks: { type: ["string", "null"] },
    }, ["taskId"])));
  }
  if (hasPermission(user, "TASKS_COMPLETE")) {
    tools.push(tool("complete_task", "Mark a visible task as completed when permitted.", objectSchema({ taskId: { type: "string" } }, ["taskId"])));
  }
  return tools;
}

const handlers: Record<string, ToolHandler> = {
  list_tasks: (args, { user }) => listTasks(user, args),
  search_employees: (args, { user }) => searchEmployees(user, args),
  list_departments: (args, { user }) => listDepartments(user, args),
  get_dashboard: (_args, { user }) => getDashboard(user),
  get_performance: (_args, { user }) => getPerformance(user),
  get_activity_logs: (args, { user }) => getActivityLogs(user, args),
  create_task: (args, { user }) => createTask(user, args),
  update_task: (args, { user }) => updateTask(user, args),
  complete_task: (args, { user }) => completeTask(user, args),
};

export async function executeTool(name: string, args: unknown, context: ToolContext): Promise<ToolExecutionResult> {
  const handler = handlers[name];
  if (!handler) return { ok: false, message: `Tool ${name} is not available.` };
  try {
    return await handler(asRecord(args), context);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, message: error.issues[0]?.message || "Invalid tool arguments." };
    }
    console.error(`Tool ${name} failed`, error);
    return { ok: false, message: "The operation failed. Please try again." };
  }
}

export function publicToolNames(user: AgentUser): string[] {
  return buildToolDefinitions(user).map((definition) => definition.function.name);
}
