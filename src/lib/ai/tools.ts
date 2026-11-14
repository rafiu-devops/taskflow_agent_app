import "server-only";
import { z } from "zod";
import { managementJson } from "@/lib/auth/server";
import { hasPermission } from "@/lib/permissions";
import { createProposal } from "@/lib/agent/proposals";
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
  ChatEmployeeFormCard,
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
  statusCode?: number;
}

interface ToolContext {
  user: AgentUser;
  allowEmployeeCreation?: boolean;
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

const createEmployeeSchema = z.object({
  fullName: z.string().trim().min(1, "Employee full name is required").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid work email").max(254),
  employeeId: z.string().trim().min(3).max(20).optional(),
  departmentId: z.string().trim().min(1).max(20).optional(),
  designation: z.string().trim().max(120).optional(),
  accountStatus: z.enum(["Active", "Inactive"]).optional(),
  joiningDate: z.string().regex(datePattern, "Use YYYY-MM-DD").optional(),
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

const performanceSchema = z.object({
  employee: z.string().trim().min(1).optional(),
  department: z.string().trim().min(1).optional(),
}).strict();

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
    const metrics: ChatPerformanceCard["metrics"] = [];
    for (const [key, label] of [
      ["totalTasks", "Total tasks"],
      ["completedTasks", "Completed"],
      ["pendingTasks", "Pending"],
      ["inProgressTasks", "In progress"],
      ["overdueTasks", "Overdue"],
    ] as const) {
      const value = numericField(kpis, key);
      if (value !== undefined) metrics.push({ label, value: String(value) });
    }
    for (const [key, label] of [
      ["overallCompletionRate", "Completion rate"],
      ["onTimeCompletionRate", "On-time rate"],
    ] as const) {
      const value = numericField(kpis, key);
      if (value !== undefined) metrics.push({ label, value: `${value}%` });
    }
    if (metrics.length) {
      const card: ChatPerformanceCard = { type: "performance", title: "Organization performance", metrics };
      return { ok: true, message: "Loaded organization dashboard metrics.", data, card };
    }
  }
  if (summary) {
    const metrics: ChatPerformanceCard["metrics"] = [];
    for (const [key, label] of [
      ["totalTasks", "Total tasks"],
      ["completedTasks", "Completed"],
      ["pendingTasks", "Pending"],
      ["overdueTasks", "Overdue"],
    ] as const) {
      const value = numericField(summary, key);
      if (value !== undefined) metrics.push({ label, value: String(value) });
    }
    if (metrics.length) {
      const card: ChatPerformanceCard = { type: "performance", title: "My dashboard", metrics };
      return { ok: true, message: "Loaded your dashboard summary.", data, card };
    }
  }
  return { ok: true, message: "Dashboard task statistics are not available for this account.", data, card: { type: "notice", tone: "info", message: "Dashboard task statistics are not available for this account." } };
}

function numericField(row: Record<string, unknown>, key: string): number | undefined {
  const value = row[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

async function getPerformance(user: AgentUser, rawArgs: unknown): Promise<ToolExecutionResult> {
  const args = performanceSchema.parse(user.role === "admin" ? asRecord(rawArgs) : {});
  if (user.role !== "admin" && !hasPermission(user, "PERFORMANCE_VIEW_MY")) {
    return { ok: false, permissionRequired: "PERFORMANCE_VIEW_MY", message: "You do not have permission to view your performance data." };
  }
  const result = await managementJson<{ performance: Array<Record<string, unknown>>; scope?: string }>("/api/performance");
  if (!result.ok || !result.data) {
    return { ok: false, message: result.status === 403 ? "You do not have permission to view performance data." : "Unable to load performance data." };
  }
  let rows = result.data.performance ?? [];

  if (user.role !== "admin") {
    if (!user.employeeId) {
      return { ok: false, message: "Your employee profile is not linked to an employee record." };
    }
    rows = rows.filter((row) => String(row.employeeId ?? "").trim().toLowerCase() === user.employeeId?.toLowerCase());
  } else if (args.employee) {
    const resolved = await resolveEmployee(user, args.employee);
    if (!resolved.employee) {
      return {
        ok: false,
        message: resolved.error ?? "That employee name is ambiguous. Please specify an employee ID.",
        data: resolved.candidates,
      };
    }
    rows = rows.filter((row) => String(row.employeeId ?? "").trim().toLowerCase() === resolved.employee?.employeeId.toLowerCase());
  }

  if (user.role === "admin" && args.department) {
    const resolved = await resolveDepartment(user, args.department);
    if (!resolved.department) {
      return {
        ok: false,
        message: resolved.error ?? "That department is ambiguous. Please specify a department ID.",
        data: resolved.candidates,
      };
    }
    const employees = await employeesForUser(user);
    if (!employees) return { ok: false, message: "Unable to load employees to filter department performance." };
    const employeeIds = new Set(
      employees
        .filter((employee) => employee.departmentId?.toLowerCase() === resolved.department?.departmentId.toLowerCase())
        .map((employee) => employee.employeeId.toLowerCase()),
    );
    rows = rows.filter((row) => employeeIds.has(String(row.employeeId ?? "").trim().toLowerCase()));
  }

  if (!rows.length) {
    const message = user.role !== "admin"
      ? "Your performance records are not available yet. Once your assigned tasks have been tracked in the system, your performance information will become available."
      : "No performance records were found for that request.";
    return { ok: true, message, card: { type: "notice", tone: "info", message } };
  }

  const metrics: ChatPerformanceCard["metrics"] = [];
  for (const [key, label] of [
    ["totalAssignedTasks", "Assigned tasks"],
    ["completedTasks", "Completed"],
    ["overdueTasks", "Overdue"],
  ] as const) {
    const values = rows.map((row) => numericField(row, key)).filter((value): value is number => value !== undefined);
    if (values.length === rows.length) metrics.push({ label, value: String(values.reduce((sum, value) => sum + value, 0)) });
  }
  if (rows.length === 1) {
    const completionRate = numericField(rows[0], "completionRate");
    if (completionRate !== undefined) metrics.push({ label: "Completion rate", value: `${completionRate}%` });
  }
  rows.sort((a, b) => (numericField(b, "completedTasks") ?? -1) - (numericField(a, "completedTasks") ?? -1));
  const card: ChatPerformanceCard = {
    type: "performance",
    title: user.role !== "admin"
      ? "My performance"
      : args.employee
        ? "Employee performance"
        : args.department
          ? "Department performance"
          : result.data.scope === "department"
            ? "Department performance"
            : "Performance report",
    metrics,
    rows: rows.slice(0, 10).map((row) => ({
      name: String(row.employeeName ?? row.employeeId ?? "Unknown"),
      assigned: numericField(row, "totalAssignedTasks"),
      completed: numericField(row, "completedTasks"),
      overdue: numericField(row, "overdueTasks"),
      completionRate: numericField(row, "completionRate"),
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

async function proposeAssignTask(user: AgentUser, rawArgs: unknown): Promise<ToolExecutionResult> {
  const args = createTaskSchema.parse(asRecord(rawArgs));
  if (!hasPermission(user, "TASKS_CREATE")) {
    return { ok: false, permissionRequired: "TASKS_CREATE", message: "You do not have permission to create tasks." };
  }
  if (user.role !== "admin" && (args.assignedTo || args.assignee) && !hasPermission(user, "TASKS_ASSIGN")) {
    return { ok: false, permissionRequired: "TASKS_ASSIGN", message: "You do not have permission to assign tasks to other employees." };
  }

  const payload: Record<string, unknown> = {
    title: args.title,
    description: args.description ?? null,
    priority: args.priority ?? "Medium",
  };
  if (args.dueDate) payload.dueDate = args.dueDate;
  if (args.remarks) payload.remarks = args.remarks;

  const assignee = args.assignedTo ?? args.assignee;
  let assigneeName = user.name;
  if (assignee) {
    const resolved = await resolveEmployee(user, assignee);
    if (!resolved.employee) {
      return { ok: false, message: resolved.error ?? "Employee not found or ambiguous.", data: resolved.candidates };
    }
    payload.assignedTo = resolved.employee.employeeId;
    assigneeName = resolved.employee.fullName || resolved.employee.employeeId;
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

  const summary = [
    { label: "Title", value: String(payload.title) },
    { label: "Assignee", value: assigneeName },
    { label: "Due", value: String(payload.dueDate ?? "No due date") },
    { label: "Priority", value: String(payload.priority) },
  ];

  const proposal = createProposal(user, "create_task", payload, summary);
  return {
    ok: true,
    message: "Proposal created. Ask the user to confirm.",
    data: { proposalId: proposal.id, summary: proposal.summary, expiresAt: new Date(proposal.expiresAt).toISOString() },
  };
}

async function proposeUpdateTask(user: AgentUser, rawArgs: unknown): Promise<ToolExecutionResult> {
  const args = updateTaskSchema.parse(asRecord(rawArgs));
  const existing = await findTask(user, args.taskId);
  if (!existing) return { ok: false, message: "Task not found or not visible to you." };

  const payload: Record<string, unknown> = { taskId: existing.taskId };
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
    if (/^dep-\d+$/i.test(departmentQuery)) payload.departmentId = departmentQuery.toUpperCase();
    else {
      const resolved = await resolveDepartment(user, departmentQuery);
      if (!resolved.department) return { ok: false, message: resolved.error ?? "Department not found or ambiguous.", data: resolved.candidates };
      payload.departmentId = resolved.department.departmentId;
    }
  }

  const summary = [{ label: "Task", value: `${existing.taskId}: ${existing.title}` }];
  for (const [key, value] of Object.entries(payload)) {
    if (key !== "taskId") summary.push({ label: key, value: String(value) });
  }

  const proposal = createProposal(user, "update_task", payload, summary);
  return {
    ok: true,
    message: "Proposal created. Ask the user to confirm.",
    data: { proposalId: proposal.id, summary: proposal.summary, expiresAt: new Date(proposal.expiresAt).toISOString() },
  };
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

const employeeEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function employeeCreateArgs(raw: Record<string, unknown>) {
  const fullName = typeof raw.fullName === "string" ? raw.fullName.trim() : "";
  const email = typeof raw.email === "string" ? raw.email.trim().toLowerCase() : "";
  const employeeId = typeof raw.employeeId === "string" && raw.employeeId.trim() ? raw.employeeId.trim().toUpperCase() : null;
  const departmentId = typeof raw.departmentId === "string" && raw.departmentId.trim() ? raw.departmentId.trim().toUpperCase() : null;
  const department = typeof raw.department === "string" && raw.department.trim() ? raw.department.trim() : null;
  const designation = typeof raw.designation === "string" && raw.designation.trim() ? raw.designation.trim() : null;
  const accountStatus = typeof raw.accountStatus === "string" && raw.accountStatus.trim() ? raw.accountStatus.trim() : null;
  const joiningDate = typeof raw.joiningDate === "string" && raw.joiningDate.trim() ? raw.joiningDate.trim() : null;
  return { fullName, email, employeeId, departmentId, department, designation, accountStatus, joiningDate };
}

async function resolveEmployeeCreateDepartment(
  user: AgentUser,
  department: string | null,
  departmentId: string | null = null,
): Promise<{ departmentId: string | null; error?: string; candidates?: DepartmentSummary[] }> {
  if (!department && !departmentId) return { departmentId: null };
  const departments = await departmentsForUser(user);
  if (!departments) return { departmentId: null, error: "Unable to validate the selected department." };
  const byId = departmentId
    ? departments.find((item) => item.departmentId.toLowerCase() === departmentId.toLowerCase())
    : undefined;
  if (departmentId && !byId) return { departmentId: null, error: "The selected department ID is not valid." };
  let byName: DepartmentSummary | undefined;
  if (department) {
    const named = await resolveDepartment(user, department);
    if (!named.department) {
      return { departmentId: null, error: named.error ?? "Department not found or ambiguous.", candidates: named.candidates };
    }
    byName = named.department;
  }
  if (byId && byName && byName.departmentId !== byId.departmentId) {
    return { departmentId: null, error: "The selected department and department ID do not match." };
  }
  return { departmentId: byId?.departmentId ?? byName?.departmentId ?? null };
}

async function proposeCreateEmployee(user: AgentUser, rawArgs: unknown): Promise<ToolExecutionResult> {
  if (user.role !== "admin") {
    return { ok: false, permissionRequired: "ADMIN", message: "Only administrators can create employees." };
  }
  const args = employeeCreateArgs(asRecord(rawArgs));
  const message = args.fullName
    ? `Yes, I can help you add ${args.fullName}. Please review and complete the employee details using the form below.`
    : "Yes, I can help you add a new employee. Please provide the employee's details using the form below.";
  return employeeFormResponse(args, message);
}

async function employeeFormResponse(args: ReturnType<typeof employeeCreateArgs>, message: string): Promise<ToolExecutionResult> {
  const result = await managementJson<{ departments: DepartmentSummary[] }>("/api/departments");
  if (!result.ok || !result.data) {
    const statusCode = result.status >= 400 ? result.status : 503;
    return {
      ok: false,
      permissionRequired: result.status === 403 ? "DEPARTMENTS_VIEW" : undefined,
      message: result.status === 403 ? "You do not have permission to view departments." : "Unable to load departments. No employee was created.",
      statusCode,
    };
  }
  const departments = result.data.departments ?? [];
  const selectedDepartment = departments.find((department) =>
    department.departmentId.toLowerCase() === (args.departmentId ?? args.department ?? "").toLowerCase()
      || department.departmentName.toLowerCase() === (args.department ?? "").toLowerCase(),
  );
  const card: ChatEmployeeFormCard = {
    type: "employee_form",
    title: "Add a new employee",
    message: `${message} The management system assigns an employee ID when the field is left blank.`,
    fields: [
      { key: "fullName", label: "Full name", type: "text", required: true, defaultValue: args.fullName ?? "", placeholder: "e.g. Ali Raza" },
      { key: "email", label: "Work email", type: "email", required: true, defaultValue: args.email ?? "", placeholder: "e.g. ali.raza@taskflow.com" },
      { key: "employeeId", label: "Employee ID", type: "text", required: false, defaultValue: args.employeeId ?? "", placeholder: "Leave blank for automatic assignment" },
      {
        key: "departmentId",
        label: "Department",
        type: "select",
        required: false,
        defaultValue: selectedDepartment?.departmentId ?? "",
        options: departments.map((department) => ({ label: department.departmentName, value: department.departmentId })),
        help: departments.length
          ? "The department ID is populated from the selected department."
          : "No departments are currently available; department is optional.",
      },
      { key: "designation", label: "Designation", type: "text", required: false, defaultValue: args.designation ?? "", placeholder: "e.g. Software Engineer" },
      { key: "accountStatus", label: "Employment status", type: "select", required: false, defaultValue: args.accountStatus === "Inactive" ? "Inactive" : "Active", options: [{ label: "Active", value: "Active" }, { label: "Inactive", value: "Inactive" }] },
      { key: "joiningDate", label: "Joining date", type: "date", required: false, defaultValue: args.joiningDate ?? "", placeholder: "YYYY-MM-DD" },
    ],
  };
  return { ok: true, message, data: { card }, card };
}

async function createEmployee(user: AgentUser, rawArgs: unknown): Promise<ToolExecutionResult> {
  if (user.role !== "admin") {
    return { ok: false, permissionRequired: "ADMIN", message: "Only administrators can create employees.", statusCode: 403 };
  }
  const args = employeeCreateArgs(asRecord(rawArgs));
  if (!args.fullName) {
    return { ok: false, message: "I can help you add a new employee. What is the employee's full name?", statusCode: 400 };
  }
  if (!args.email) {
    return { ok: false, message: `I can help you add ${args.fullName}. What is the employee's work email address?`, statusCode: 400 };
  }
  if (!employeeEmailPattern.test(args.email)) {
    return { ok: false, message: "That does not look like a valid work email address. What email should I use?", statusCode: 400 };
  }

  const payload = createEmployeeSchema.parse({
    fullName: args.fullName,
    email: args.email,
    employeeId: args.employeeId ?? undefined,
    departmentId: args.departmentId ?? undefined,
    designation: args.designation ?? undefined,
    accountStatus: args.accountStatus ?? undefined,
    joiningDate: args.joiningDate ?? undefined,
  });

  const department = await resolveEmployeeCreateDepartment(user, args.department, args.departmentId);
  if (department.error) return { ok: false, message: department.error, data: department.candidates, statusCode: 400 };
  if (department.departmentId) payload.departmentId = department.departmentId;

  const employees = await employeesForUser(user);
  if (employees) {
    const duplicateEmail = employees.find((employee) => employee.email?.toLowerCase() === String(payload.email ?? "").toLowerCase());
    if (duplicateEmail) {
      return { ok: false, message: `An employee with the email ${String(payload.email)} already exists (${duplicateEmail.fullName}). I did not create a duplicate record.`, statusCode: 409 };
    }
    if (payload.employeeId && employees.some((employee) => employee.employeeId.toLowerCase() === String(payload.employeeId).toLowerCase())) {
      return { ok: false, message: `An employee with the ID ${String(payload.employeeId)} already exists. I did not create a duplicate record.`, statusCode: 409 };
    }
  }

  const created = await managementJson<{ employee: Record<string, unknown> }>("/api/employees", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const createdEmployee = created.ok ? (created.data?.employee as Record<string, unknown> | null) : null;
  if (!created.ok || !createdEmployee) {
    const errorMessage = (created.data as { error?: string } | null)?.error;
    const message = created.status === 403
      ? "You do not have permission to create employees."
      : errorMessage ?? (created.status === 409 ? "An employee with these details already exists." : "Unable to create the employee. Please try again.");
    const statusCode = created.status >= 400 ? created.status : 502;
    return { ok: false, message, data: created.data ?? undefined, statusCode };
  }
  if (typeof createdEmployee.employeeId !== "string" || !createdEmployee.employeeId.trim()) {
    return {
      ok: false,
      message: "The management system did not return the new employee ID. Verify the record before retrying.",
      statusCode: 502,
    };
  }

  const employeeSummary: EmployeeSummary = {
    employeeId: createdEmployee.employeeId,
    fullName: String(createdEmployee.fullName ?? payload.fullName ?? ""),
    email: typeof createdEmployee.email === "string" ? createdEmployee.email : String(payload.email ?? ""),
    departmentId: typeof createdEmployee.departmentId === "string" ? createdEmployee.departmentId : null,
    departmentName: typeof createdEmployee.departmentName === "string" ? createdEmployee.departmentName : null,
    designation: typeof createdEmployee.designation === "string" ? createdEmployee.designation : null,
    accountStatus: typeof createdEmployee.accountStatus === "string" ? createdEmployee.accountStatus : "Active",
  };
  const details = [
    `- Employee ID: ${employeeSummary.employeeId}`,
    `- Name: ${employeeSummary.fullName}`,
    ...(employeeSummary.departmentName
      ? [`- Department: ${employeeSummary.departmentName}`]
      : employeeSummary.departmentId
        ? [`- Department ID: ${employeeSummary.departmentId}`]
        : []),
    ...(employeeSummary.designation ? [`- Designation: ${employeeSummary.designation}`] : []),
    `- Email: ${employeeSummary.email}`,
    ...(employeeSummary.accountStatus ? [`- Status: ${employeeSummary.accountStatus}`] : []),
  ];
  const message = `Employee successfully added.\n\n${details.join("\n")}\n\nThe employee record is now available in the Management System.`;
  const card: ChatConfirmationCard = {
    type: "confirmation",
    title: "Employee created",
    message,
    operation: "create_employee",
    employee: employeeSummary,
    timestamp: new Date().toISOString(),
  };
  return { ok: true, message, data: { employee: employeeSummary }, card };
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
  if (user.role === "admin" || hasPermission(user, "PERFORMANCE_VIEW_MY")) {
    tools.push(tool(
      "get_performance",
      "Get live performance data. Employees can only view their own rows. Admins may optionally filter by employee or department; the available endpoint does not provide period-specific results.",
      objectSchema(user.role === "admin" ? {
        employee: { type: "string", description: "Filter to one employee by name, email or ID." },
        department: { type: "string", description: "Filter to one department by name or ID." },
      } : {}),
    ));
  }
  if (hasAnyPermissionUser(user, ["ACTIVITY_LOGS_VIEW", "ACTIVITY_LOGS_VIEW_MY"])) {
    tools.push(tool("get_activity_logs", "Get recent activity/audit logs when permitted.", objectSchema({ limit: { type: "number", minimum: 1, maximum: 25 } })));
  }
  if (hasPermission(user, "TASKS_CREATE")) {
    tools.push(tool("propose_assign_task", "Propose creating/assigning a task. Does not write; user must confirm.", objectSchema({
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
  if (user.role === "admin") {
    tools.push(tool("propose_create_employee", "Open the structured employee registration form whenever an administrator asks to add an employee, even if no details have been supplied yet. Populate only details the administrator already provided. The administrator must review and confirm the completed form before anything is created.", objectSchema({
      fullName: { type: "string", description: "Employee's full name (required)." },
      email: { type: "string", description: "Employee's work email address (required, must be unique)." },
      employeeId: { type: "string", description: "Employee ID to assign (optional; generated when omitted)." },
      department: { type: "string", description: "Department name or ID (optional)." },
      departmentId: { type: "string" },
      designation: { type: "string" },
      accountStatus: { type: "string", enum: ["Active", "Inactive"] },
      joiningDate: { type: "string", pattern: datePattern.source, description: "YYYY-MM-DD" },
    })));
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
    tools.push(tool("propose_update_task", "Propose updating a visible task. Does not write; user must confirm.", objectSchema({
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
  get_performance: (args, { user }) => getPerformance(user, args),
  get_activity_logs: (args, { user }) => getActivityLogs(user, args),
  create_task: (args, { user }) => createTask(user, args),
  update_task: (args, { user }) => updateTask(user, args),
  complete_task: (args, { user }) => completeTask(user, args),
  create_employee: (args, { user }) => createEmployee(user, args),
  propose_assign_task: (args, { user }) => proposeAssignTask(user, args),
  propose_create_employee: (args, { user }) => proposeCreateEmployee(user, args),
  propose_update_task: (args, { user }) => proposeUpdateTask(user, args),
};

export async function executeTool(name: string, args: unknown, context: ToolContext): Promise<ToolExecutionResult> {
  if (name === "create_employee" && !context.allowEmployeeCreation) {
    return { ok: false, permissionRequired: "EMPLOYEE_FORM_CONFIRMATION", message: "Employee creation requires administrator review and confirmation." };
  }
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

