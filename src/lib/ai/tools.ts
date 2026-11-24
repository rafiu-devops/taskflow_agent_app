import "server-only";
import { z } from "zod";
import { managementJson } from "@/lib/auth/server";
import { hasPermission } from "@/lib/permissions";
import { createProposal } from "@/lib/agent/proposals";
import {
  compareTaskDate,
  isTaskOverdue,
  sortRecent,
  isTaskCompleted,
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

class ManagementDataError extends Error {
  constructor(readonly resource: string, readonly status: number) {
    super(`Unable to retrieve ${resource}`);
  }
}

type ToolHandler = (args: Record<string, unknown>, context: ToolContext) => Promise<ToolExecutionResult>;

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const isoDate = z.string().regex(datePattern, "Use YYYY-MM-DD");

const listTasksSchema = z.object({
  scope: z.enum(["my_tasks", "employee_tasks", "department_tasks", "all_tasks"]).optional(),
  employee: z.string().optional(),
  employeeId: z.string().optional(),
  employeeName: z.string().optional(),
  employees: z.array(z.string()).optional(),
  assignee: z.string().optional(),
  assignedTo: z.string().optional(),
  assignees: z.array(z.string()).optional(),
  department: z.string().optional(),
  departmentId: z.string().optional(),
  status: z.enum(["Pending", "In Progress", "Completed", "Overdue"]).optional(),
  priority: z.enum(["Low", "Medium", "High", "Urgent"]).optional(),
  due: z.enum(["today", "overdue"]).optional(),
  dueDate: z.string().regex(datePattern).optional(),
  fromDate: z.string().regex(datePattern).optional(),
  toDate: z.string().regex(datePattern).optional(),
  assignedToday: z.boolean().optional(),
  completedToday: z.boolean().optional(),
  search: z.string().optional(),
  limit: z.number().int().min(1).max(500).optional(),
});

const searchEmployeesSchema = z.object({
  search: z.string().optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

const listDepartmentsSchema = z.object({
  search: z.string().optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
  assignedTo: z.string().nullish(),
  assignee: z.string().nullish(),
  departmentId: z.string().nullish(),
  department: z.string().nullish(),
  priority: z.enum(["Low", "Medium", "High", "Urgent"]).nullish(),
  dueDate: isoDate.nullish(),
  remarks: z.string().max(2000).nullish(),
});

const createEmployeeSchema = z.object({
  fullName: z.string().trim().min(1, "Employee full name is required").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid work email").max(254),
  employeeId: z.string().trim().min(3).max(20).nullish(),
  departmentId: z.string().trim().min(1).max(20).nullish(),
  designation: z.string().trim().max(120).nullish(),
  accountStatus: z.enum(["Active", "Inactive"]).nullish(),
  joiningDate: z.string().regex(datePattern, "Use YYYY-MM-DD").nullish(),
});

const updateTaskSchema = z.object({
  taskId: z.string().min(1),
  title: z.string().min(1).max(200).nullish(),
  description: z.string().max(2000).nullish(),
  assignedTo: z.string().nullish(),
  assignee: z.string().nullish(),
  departmentId: z.string().nullish(),
  department: z.string().nullish(),
  priority: z.enum(["Low", "Medium", "High", "Urgent"]).nullish(),
  status: z.enum(["Pending", "In Progress", "Completed"]).nullish(),
  dueDate: isoDate.nullish(),
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

const employeeUpdateRequestSchema = z.object({
  employee: z.string().trim().min(1),
  fullName: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().email().max(254).optional(),
  department: z.string().trim().min(1).optional(),
  departmentId: z.string().trim().min(1).optional(),
  designation: z.string().trim().max(120).nullable().optional(),
  accountStatus: z.enum(["Active", "Inactive"]).optional(),
  joiningDate: isoDate.nullable().optional(),
}).strict();

const departmentMutationSchema = z.object({
  departmentName: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  manager: z.string().trim().max(120).nullable().optional(),
  status: z.enum(["Active", "Inactive"]).optional(),
}).strict();

const departmentCreateSchema = departmentMutationSchema.extend({
  departmentName: z.string().trim().min(1).max(120),
});

const employeePermissionsQuerySchema = z.object({
  employee: z.string().trim().min(1).optional(),
  permissionKey: z.string().trim().min(1).optional(),
  search: z.string().trim().optional(),
}).strict();

const permissionChangeSchema = z.object({
  employee: z.string().trim().min(1),
  permissionKey: z.string().trim().min(1).optional(),
  permissionKeys: z.array(z.string().trim().min(1)).min(1).optional(),
  granted: z.boolean(),
  revokeAll: z.boolean().optional(),
}).strict().refine((value) => value.revokeAll === true || Boolean(value.permissionKey) !== Boolean(value.permissionKeys?.length), "Provide one permission key or a list of permission keys.");

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function taskSummary(task: Record<string, unknown>, names?: { employees?: Map<string, string>; departments?: Map<string, string> }): TaskSummary {
  const assignedTo = task.assignedTo ? String(task.assignedTo) : null;
  const departmentId = task.departmentId ? String(task.departmentId) : null;
  return {
    taskId: String(task.taskId ?? ""),
    title: String(task.title ?? ""),
    description: task.description ? String(task.description) : null,
    assignedTo,
    assignedName: assignedTo ? names?.employees?.get(assignedTo) ?? null : null,
    departmentId,
    departmentName: departmentId ? names?.departments?.get(departmentId) ?? null : null,
    priority: (task.priority as TaskSummary["priority"]) ?? null,
    status: (task.status as TaskSummary["status"]) ?? null,
    dueDate: task.dueDate ? String(task.dueDate) : null,
    assignedDate: task.assignedDate ? String(task.assignedDate) : null,
    completionDate: task.completionDate ? String(task.completionDate) : null,
    createdAt: task.createdAt ? String(task.createdAt) : null,
    updatedAt: task.updatedAt ? String(task.updatedAt) : null,
    progressPercentage: typeof task.progressPercentage === "number" ? task.progressPercentage : Number(task.progressPercentage ?? 0) || 0,
    remarks: task.remarks ? String(task.remarks) : null,
  };
}

async function employeesForUser(user: AgentUser): Promise<EmployeeSummary[] | null> {
  if (!hasPermission(user, "EMPLOYEES_VIEW_DIRECTORY")) return null;
  const result = await managementJson<{ employees: EmployeeSummary[] }>("/api/employees");
  if (!result.ok || !result.data) throw new ManagementDataError("employee records", result.status);
  return result.data.employees ?? [];
}

async function departmentsForUser(user: AgentUser): Promise<DepartmentSummary[] | null> {
  if (!hasPermission(user, "DEPARTMENTS_VIEW")) return null;
  const result = await managementJson<{ departments: DepartmentSummary[] }>("/api/departments");
  if (!result.ok || !result.data) throw new ManagementDataError("department records", result.status);
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

function taskFlowTodayDateOnly(now = new Date()): string {
  const timeZone = process.env.TASKFLOW_TIME_ZONE?.trim() || process.env.TZ?.trim() || "UTC";
  try {
    const parts = new Intl.DateTimeFormat("en", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
    return `${value("year")}-${value("month")}-${value("day")}`;
  } catch {
    return new Intl.DateTimeFormat("en", {
      timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(now).reduce((date, part) => {
      if (part.type === "year") date.year = part.value;
      if (part.type === "month") date.month = part.value;
      if (part.type === "day") date.day = part.value;
      return date;
    }, { year: "0000", month: "00", day: "00" }).year + "-" +
      new Intl.DateTimeFormat("en", { timeZone: "UTC", month: "2-digit" }).format(now) + "-" +
      new Intl.DateTimeFormat("en", { timeZone: "UTC", day: "2-digit" }).format(now);
  }
}

async function listTasks(user: AgentUser, rawArgs: unknown): Promise<ToolExecutionResult> {
  const args = listTasksSchema.parse(asRecord(rawArgs));

  if (!hasAnyPermissionUser(user, ["TASKS_VIEW_MY", "TASKS_VIEW_DEPARTMENT", "TASKS_VIEW_ALL"])) {
    return { ok: false, permissionRequired: "TASKS_VIEW_MY | TASKS_VIEW_DEPARTMENT | TASKS_VIEW_ALL", message: "You do not have permission to view tasks." };
  }

  const result = await managementJson<{ tasks: Record<string, unknown>[]; scope?: string }>("/api/tasks");
  if (!result.ok || !result.data) {
    const message = result.status === 403
      ? "You do not have permission to view tasks."
      : "I couldn't retrieve tasks right now. Please try again.";
    return { ok: false, permissionRequired: result.status === 403 ? "TASKS_VIEW_MY | TASKS_VIEW_DEPARTMENT | TASKS_VIEW_ALL" : undefined, message, statusCode: result.status };
  }
  const [employees, departments] = await Promise.all([employeesForUser(user), departmentsForUser(user)]);
  const names = { employees: employeeNameMap(employees), departments: departmentNameMap(departments) };
  const employeeById = new Map((employees ?? []).map((employee) => [employee.employeeId.toLowerCase(), employee]));
  const departmentById = new Map((departments ?? []).map((department) => [department.departmentId.toLowerCase(), department]));

  let tasks = (result.data.tasks ?? []).map((task) => taskSummary(task, names));
  const today = taskFlowTodayDateOnly();

  const isAdmin = user.role === "admin";
  const assigneeInputs = [
    ...(Array.isArray(args.assignees) ? args.assignees : []),
    ...(Array.isArray(args.employees) ? args.employees : []),
  ];
  if (args.employee) assigneeInputs.push(args.employee);
  if (args.employeeId) assigneeInputs.push(args.employeeId);
  if (args.employeeName) assigneeInputs.push(args.employeeName);
  if (args.assignee) assigneeInputs.push(args.assignee);
  if (args.assignedTo) assigneeInputs.push(args.assignedTo);

  const requestedEmployeeIds = new Set<string>();

  if (!isAdmin) {
    if (user.employeeId) requestedEmployeeIds.add(user.employeeId.toLowerCase());
  } else if (assigneeInputs.length) {
    for (const input of assigneeInputs) {
      const trimmed = String(input).trim();
      if (!trimmed) continue;
      if (/^emp-/i.test(trimmed)) {
        requestedEmployeeIds.add(trimmed.toUpperCase());
        continue;
      }
      const resolved = await resolveEmployee(user, trimmed);
      if (resolved.candidates && resolved.candidates.length > 1) {
        return {
          ok: false,
          message: `Multiple employees matched "${trimmed}". Please specify the employee ID.`,
          data: { candidates: resolved.candidates.slice(0, 5) },
        };
      }
      if (!resolved.employee) {
        return { ok: false, message: resolved.error ?? `No employee found for "${trimmed}".` };
      }
      requestedEmployeeIds.add(resolved.employee.employeeId.toLowerCase());
    }
  }

  if (requestedEmployeeIds.size) {
    tasks = tasks.filter((task) => task.assignedTo && requestedEmployeeIds.has(String(task.assignedTo).toLowerCase()));
  }

  const departmentQuery = args.departmentId ?? args.department;
  if (departmentQuery) {
    let departmentId = String(departmentQuery).trim();
    if (!/^dep-/i.test(departmentId)) {
      const resolved = await resolveDepartment(user, departmentQuery);
      if (!resolved.department) return { ok: false, message: resolved.error ?? "Department not found or ambiguous.", data: resolved.candidates };
      departmentId = resolved.department.departmentId;
    }
    tasks = tasks.filter((task) => String(task.departmentId ?? "").toLowerCase() === departmentId.toLowerCase());
  }

  if (args.status) {
    tasks = tasks.filter((task) => String(task.status ?? "").toLowerCase() === String(args.status).toLowerCase());
  }
  if (args.priority) {
    tasks = tasks.filter((task) => String(task.priority ?? "").toLowerCase() === String(args.priority).toLowerCase());
  }
  if (args.due === "today") {
    tasks = tasks.filter((task) => String(task.dueDate ?? "").slice(0, 10) === today);
  } else if (args.due === "overdue") {
    tasks = tasks.filter((task) => isTaskOverdue(task, today));
  }
  if (args.dueDate) {
    tasks = tasks.filter((task) => String(task.dueDate ?? "").slice(0, 10) === args.dueDate);
  }
  if (args.fromDate) {
    tasks = tasks.filter((task) => String(task.dueDate ?? "").slice(0, 10) >= String(args.fromDate));
  }
  if (args.toDate) {
    tasks = tasks.filter((task) => String(task.dueDate ?? "").slice(0, 10) <= String(args.toDate));
  }
  if (args.assignedToday) {
    tasks = tasks.filter((task) => String(task.assignedDate ?? "").slice(0, 10) === today);
  }
  if (args.completedToday) {
    tasks = tasks.filter((task) => isTaskCompleted(task) && String(task.completionDate ?? "").slice(0, 10) === today);
  }
  if (args.search) {
    const query = args.search.toLowerCase();
    tasks = tasks.filter((task) =>
      [task.taskId, task.title, task.assignedName ?? "", task.assignedTo ?? "", task.departmentName ?? "", task.departmentId ?? ""].join(" ").toLowerCase().includes(query),
    );
  }

  tasks.sort((a, b) => sortRecent(a, b) || compareTaskDate(a.dueDate, b.dueDate));
  const limit = args.limit ?? 100;
  const limited = tasks.slice(0, limit);

  const byEmployeeMap = new Map();
  for (const task of tasks) {
    const key = String(task.assignedTo ?? "unassigned").toLowerCase();
    if (!byEmployeeMap.has(key)) {
      const employee = task.assignedTo ? employeeById.get(String(task.assignedTo).toLowerCase()) : undefined;
      const department = task.departmentId ? departmentById.get(String(task.departmentId).toLowerCase()) : undefined;
      byEmployeeMap.set(key, {
        employeeId: task.assignedTo ?? "Unassigned",
        employeeName: task.assignedName ?? (employee ? employee.fullName : null),
        departmentId: task.departmentId ?? null,
        departmentName: task.departmentName ?? (department ? department.departmentName : null),
        total: 0,
        pending: 0,
        inProgress: 0,
        completed: 0,
        overdue: 0,
      });
    }
    const entry = byEmployeeMap.get(key);
    entry.total += 1;
    const status = String(task.status ?? "").toLowerCase();
    if (status === "pending") entry.pending += 1;
    else if (status === "in progress") entry.inProgress += 1;
    else if (status === "completed") entry.completed += 1;
    if (isTaskOverdue(task, today)) entry.overdue += 1;
  }
  const byEmployee = Array.from(byEmployeeMap.values()).sort((a, b) => b.total - a.total);

  const taskCounts = {
    totalTasks: tasks.length,
    returnedTasks: limited.length,
    uniqueEmployees: byEmployee.length,
    pendingTasks: tasks.filter((task) => String(task.status ?? "").toLowerCase() === "pending" && !isTaskOverdue(task, today)).length,
    inProgressTasks: tasks.filter((task) => String(task.status ?? "").toLowerCase() === "in progress" && !isTaskOverdue(task, today)).length,
    completedTasks: tasks.filter(isTaskCompleted).length,
    overdueTasks: tasks.filter((task) => isTaskOverdue(task, today)).length,
    tasksDueToday: tasks.filter((task) => String(task.dueDate ?? "").slice(0, 10) === today).length,
    openTasksDueToday: tasks.filter((task) => String(task.dueDate ?? "").slice(0, 10) === today && !isTaskCompleted(task)).length,
  };

  const card = {
    type: "tasks",
    title: args.status ? `${args.status} tasks` : args.due === "today" ? "Today's tasks" : args.due === "overdue" ? "Overdue tasks" : "Tasks",
    subtitle: `Showing ${limited.length} of ${tasks.length} result${tasks.length === 1 ? "" : "s"}`,
    tasks: limited,
    total: tasks.length,
    emptyMessage: "No tasks match those filters.",
  };

  return {
    ok: true,
    message: `Found ${tasks.length} task${tasks.length === 1 ? "" : "s"}.`,
    data: { total: tasks.length, tasks: limited, summary: taskCounts, byEmployee, scope: result.data.scope },
    card: card as ChatTaskCard,
  };
}


async function searchEmployees(user: AgentUser, rawArgs: unknown): Promise<ToolExecutionResult> {
  const args = searchEmployeesSchema.parse(asRecord(rawArgs));
  if (!hasPermission(user, "EMPLOYEES_VIEW_DIRECTORY")) {
    return { ok: false, permissionRequired: "EMPLOYEES_VIEW_DIRECTORY", message: "You do not have permission to view the employee directory." };
  }
  const [employees, departments] = await Promise.all([employeesForUser(user), departmentsForUser(user)]);
  const names = departmentNameMap(departments);
  const query = args.search?.trim().toLowerCase() ?? "";
  const enriched = (employees ?? []).map((employee) => ({
    ...employee,
    departmentName: employee.departmentId ? names.get(employee.departmentId) ?? null : null,
    joiningDate: employee.joiningDate ? String(employee.joiningDate) : null,
  }));
  const filtered = enriched.filter((employee) => {
    if (!query) return true;
    return [employee.fullName, employee.email ?? "", employee.employeeId, employee.departmentId ?? "", employee.departmentName ?? "", employee.designation ?? "", employee.accountStatus ?? ""].join(" ").toLowerCase().includes(query);
  });
  const limit = args.limit ?? 50;
  const limited = filtered.slice(0, limit);
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
  const limited = filtered.slice(0, args.limit ?? 50);
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
    const resolved = await resolveEmployee(user, String(assignee));
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
    if (/^dep-\d+$/i.test(String(departmentQuery))) {
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
  if (assignee != null) {
    const resolved = await resolveEmployee(user, String(assignee));
    if (!resolved.employee) return { ok: false, message: resolved.error ?? "Employee not found or ambiguous.", data: resolved.candidates };
    payload.assignedTo = resolved.employee.employeeId;
  }
  const departmentQuery = args.departmentId ?? args.department;
  if (departmentQuery != null && String(departmentQuery).trim() !== "") {
    if (/^dep-\d+$/i.test(String(departmentQuery))) payload.departmentId = departmentQuery.toUpperCase();
    else {
      const resolved = await resolveDepartment(user, departmentQuery);
      if (!resolved.department) return { ok: false, message: resolved.error ?? "Department not found or ambiguous.", data: resolved.candidates };
      payload.departmentId = resolved.department.departmentId;
    }
  }

  const expected = Object.fromEntries(Object.keys(payload).filter((key) => key !== "taskId").map((key) => [key, (existing as unknown as Record<string, unknown>)[key] ?? null]));
  payload.expected = expected;
  const summary = [{ label: "Task", value: `${existing.taskId}: ${existing.title}` }];
  for (const [key, value] of Object.entries(payload)) {
    if (key !== "taskId" && key !== "expected") summary.push({ label: key, value: `${String(expected[key] ?? "Not set")} → ${String(value)}` });
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
    const resolved = await resolveEmployee(user, String(assignee));
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
    if (/^dep-\d+$/i.test(String(departmentQuery))) {
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
  const [departmentResult, employeeResult] = await Promise.all([
    managementJson<{ departments: DepartmentSummary[] }>("/api/departments"),
    managementJson<{ employees: EmployeeSummary[] }>("/api/employees"),
  ]);
  if (!departmentResult.ok || !departmentResult.data) {
    const statusCode = departmentResult.status >= 400 ? departmentResult.status : 503;
    return {
      ok: false,
      permissionRequired: departmentResult.status === 403 ? "DEPARTMENTS_VIEW" : undefined,
      message: departmentResult.status === 403 ? "You do not have permission to view departments." : "Unable to load departments. No employee was created.",
      statusCode,
    };
  }
  const departments = departmentResult.data.departments ?? [];
  const nextIdResult = await managementJson<{ employeeId: string }>("/api/employees/next-id");
  if (!nextIdResult.ok || !nextIdResult.data?.employeeId) {
    return {
      ok: false,
      message: nextIdResult.status === 403
        ? "You do not have permission to generate an employee ID."
        : "Unable to generate an employee ID. No employee was created.",
      statusCode: nextIdResult.status >= 400 ? nextIdResult.status : 503,
    };
  }
  const suggestedEmployeeId = nextIdResult.data.employeeId;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());
  const suggestedJoiningDate = args.joiningDate ?? today;
  const selectedDepartment = departments.find((department) =>
    department.departmentId.toLowerCase() === (args.departmentId ?? args.department ?? "").toLowerCase()
      || department.departmentName.toLowerCase() === (args.department ?? "").toLowerCase(),
  );
  const card: ChatEmployeeFormCard = {
    type: "employee_form",
    title: "Add a new employee",
    message: `${message} The employee ID is generated automatically by the management system and cannot be edited.`,
    fields: [
      { key: "fullName", label: "Full name", type: "text", required: true, defaultValue: args.fullName ?? "", placeholder: "e.g. Ali Raza" },
      { key: "email", label: "Work email", type: "email", required: true, defaultValue: args.email ?? "", placeholder: "e.g. ali.raza@taskflow.com" },
      { key: "employeeId", label: "Employee ID", type: "text", required: false, defaultValue: suggestedEmployeeId, placeholder: "e.g. EMP-001", readOnly: true, help: "Automatically generated by the management system." },
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
      { key: "joiningDate", label: "Joining date", type: "date", required: false, defaultValue: suggestedJoiningDate, placeholder: "YYYY-MM-DD" },
    ],
  };
  return { ok: true, message, data: { card }, card };
}

async function createEmployee(user: AgentUser, rawArgs: unknown): Promise<ToolExecutionResult> {
  if (user.role !== "admin") {
    return { ok: false, permissionRequired: "ADMIN", message: "Only administrators can create employees.", statusCode: 403 };
  }
  const args = employeeCreateArgs(asRecord(rawArgs));
  const submittedEmployeeId = args.employeeId;
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
  const idChanged = Boolean(submittedEmployeeId && submittedEmployeeId.toLowerCase() !== employeeSummary.employeeId.toLowerCase());
  const idNote = idChanged
    ? `\n\nThe requested ID ${submittedEmployeeId} was no longer available, so the management system assigned ${employeeSummary.employeeId}.`
    : "";
  const message = `Employee successfully added.\n\n${details.join("\n")}${idNote}\n\nThe employee record is now available in the Management System.`;
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
  const raw = asRecord(rawArgs);
  const expected = asRecord(raw.expected);
  const args = updateTaskSchema.parse(raw);
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
  if (assignee != null) {
    const resolved = await resolveEmployee(user, String(assignee));
    if (!resolved.employee) return { ok: false, message: resolved.error ?? "Employee not found or ambiguous.", data: resolved.candidates };
    payload.assignedTo = resolved.employee.employeeId;
  }
  const departmentQuery = args.departmentId ?? args.department;
  if (departmentQuery != null && String(departmentQuery).trim() !== "") {
    if (/^dep-\d+$/i.test(String(departmentQuery))) {
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
    body: JSON.stringify(Object.keys(expected).length ? { ...payload, expected } : payload),
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
  return proposeUpdateTask(user, { taskId: args.taskId, status: "Completed" });
}

async function proposeCreateDepartment(user: AgentUser, rawArgs: unknown): Promise<ToolExecutionResult> {
  if (user.role !== "admin") return { ok: false, permissionRequired: "ADMIN", message: "Only administrators can create departments.", statusCode: 403 };
  const args = departmentCreateSchema.parse(asRecord(rawArgs));
  const departments = await departmentsForUser(user);
  if (!departments) return { ok: false, message: "I couldn't retrieve departments to check for duplicates. Please try again." };
  if (departments.some((department) => department.departmentName.trim().toLowerCase() === args.departmentName.toLowerCase())) {
    return { ok: false, message: `The department ${args.departmentName} already exists.` };
  }
  const proposal = createProposal(user, "create_department", args, [
    { label: "Department", value: args.departmentName },
    { label: "Description", value: args.description ?? "Not provided" },
    { label: "Manager", value: args.manager ?? "Not provided" },
  ]);
  return { ok: true, message: "Review the department details and confirm to create it.", data: { proposalId: proposal.id, summary: proposal.summary, expiresAt: new Date(proposal.expiresAt).toISOString() } };
}

async function createDepartment(user: AgentUser, rawArgs: unknown): Promise<ToolExecutionResult> {
  if (user.role !== "admin") return { ok: false, permissionRequired: "ADMIN", message: "Only administrators can create departments.", statusCode: 403 };
  const args = departmentCreateSchema.parse(asRecord(rawArgs));
  const created = await managementJson<{ department: DepartmentSummary }>("/api/departments", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(args),
  });
  if (!created.ok || !created.data?.department) {
    const message = (created.data as { error?: string } | null)?.error ?? (created.status === 403 ? "You do not have permission to create departments." : "I couldn't create the department because the management system returned an error.");
    return { ok: false, message, statusCode: created.status };
  }
  const department = created.data.department;
  return { ok: true, message: `Created department ${department.departmentName} (${department.departmentId}).`, data: { department } };
}

async function proposeUpdateDepartment(user: AgentUser, rawArgs: unknown): Promise<ToolExecutionResult> {
  if (user.role !== "admin") return { ok: false, permissionRequired: "ADMIN", message: "Only administrators can update departments.", statusCode: 403 };
  const raw = asRecord(rawArgs);
  const target = typeof raw.department === "string" ? raw.department : typeof raw.departmentId === "string" ? raw.departmentId : "";
  if (!target.trim()) return { ok: false, message: "Which department would you like to update?" };
  const fields: Record<string, unknown> = { ...raw };
  delete fields.department;
  delete fields.departmentId;
  const patch = departmentMutationSchema.parse(fields);
  if (!Object.keys(patch).length) return { ok: false, message: "What should I change for that department?" };
  const resolved = await resolveDepartment(user, target);
  if (!resolved.department) return { ok: false, message: resolved.error ?? "I couldn't identify that department.", data: resolved.candidates };
  const existing = resolved.department;
  const expected = {
    departmentName: existing.departmentName,
    description: existing.description ?? null,
    manager: existing.manager ?? null,
    status: existing.status ?? null,
  };
  const summary = [{ label: "Department", value: `${existing.departmentName} (${existing.departmentId})` }];
  for (const [key, value] of Object.entries(patch)) {
    const before = expected[key as keyof typeof expected];
    summary.push({ label: key, value: `${String(before ?? "Not set")} → ${String(value ?? "Not set")}` });
  }
  const proposal = createProposal(user, "update_department", { departmentId: existing.departmentId, expected, patch }, summary);
  return { ok: true, message: "Review the department changes and confirm to apply them.", data: { proposalId: proposal.id, summary: proposal.summary, expiresAt: new Date(proposal.expiresAt).toISOString() } };
}

async function updateDepartment(user: AgentUser, rawArgs: unknown): Promise<ToolExecutionResult> {
  if (user.role !== "admin") return { ok: false, permissionRequired: "ADMIN", message: "Only administrators can update departments.", statusCode: 403 };
  const args = asRecord(rawArgs);
  const departmentId = String(args.departmentId ?? "");
  const patch = departmentMutationSchema.parse(args.patch);
  const expected = asRecord(args.expected);
  const currentResult = await managementJson<{ departments: DepartmentSummary[] }>(`/api/departments?search=${encodeURIComponent(departmentId)}`);
  if (!currentResult.ok || !currentResult.data) return { ok: false, message: "I couldn't verify the department before updating it. Please try again." };
  const current = (currentResult.data.departments ?? []).find((item) => item.departmentId === departmentId);
  if (!current) return { ok: false, message: "That department no longer exists. Please search again." };
  const currentValues: Record<string, unknown> = { ...current };
  if (Object.keys(patch).some((key) => String(currentValues[key] ?? "") !== String(expected[key] ?? ""))) {
    return { ok: false, message: "The department changed after you reviewed this proposal. Please review the latest details and try again.", statusCode: 409 };
  }
  const updated = await managementJson<{ department: DepartmentSummary }>(`/api/departments/${encodeURIComponent(departmentId)}`, {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...patch, expected }),
  });
  if (!updated.ok || !updated.data?.department) {
    return { ok: false, message: (updated.data as { error?: string } | null)?.error ?? "I couldn't update the department because the management system returned an error.", statusCode: updated.status };
  }
  const department = updated.data.department;
  return { ok: true, message: `Updated department ${department.departmentName} (${department.departmentId}).`, data: { department } };
}

async function proposeUpdateEmployee(user: AgentUser, rawArgs: unknown): Promise<ToolExecutionResult> {
  if (user.role !== "admin") return { ok: false, permissionRequired: "ADMIN", message: "Only administrators can update employee records.", statusCode: 403 };
  const args = employeeUpdateRequestSchema.parse(asRecord(rawArgs));
  const { employee: target, department, departmentId, ...fields } = args;
  const patch: Record<string, unknown> = { ...fields };
  const departmentQuery = departmentId ?? department;
  if (departmentQuery != null && String(departmentQuery).trim() !== "") {
    const resolved = await resolveDepartment(user, departmentQuery);
    if (!resolved.department) return { ok: false, message: resolved.error ?? "I couldn't identify that department.", data: resolved.candidates };
    patch.departmentId = resolved.department.departmentId;
  }
  if (!Object.keys(patch).length) return { ok: false, message: "Which employee details would you like to change?" };
  const resolved = await resolveEmployee(user, target);
  if (!resolved.employee) return { ok: false, message: resolved.error ?? "I couldn't identify that employee.", data: resolved.candidates };
  const existing = resolved.employee;
  const expected = Object.fromEntries(Object.keys(patch).map((key) => [key, (existing as unknown as Record<string, unknown>)[key] ?? null]));
  const labels: Record<string, string> = { fullName: "Name", email: "Email", departmentId: "Department ID", designation: "Designation", accountStatus: "Account status", joiningDate: "Joining date" };
  const summary = [{ label: "Employee", value: `${existing.fullName} (${existing.employeeId})` }];
  for (const [key, value] of Object.entries(patch)) summary.push({ label: labels[key] ?? key, value: `${String(expected[key] ?? "Not set")} → ${String(value ?? "Not set")}` });
  const proposal = createProposal(user, "update_employee", { employeeId: existing.employeeId, expected, patch }, summary);
  return { ok: true, message: "Review the employee changes and confirm to apply them.", data: { proposalId: proposal.id, summary: proposal.summary, expiresAt: new Date(proposal.expiresAt).toISOString() } };
}

async function updateEmployee(user: AgentUser, rawArgs: unknown): Promise<ToolExecutionResult> {
  if (user.role !== "admin") return { ok: false, permissionRequired: "ADMIN", message: "Only administrators can update employee records.", statusCode: 403 };
  const args = asRecord(rawArgs);
  const employeeId = String(args.employeeId ?? "");
  const patch = employeeUpdateRequestSchema.omit({ employee: true, department: true }).parse(args.patch);
  const expected = asRecord(args.expected);
  const currentResult = await managementJson<{ employee: EmployeeSummary }>(`/api/employees/${encodeURIComponent(employeeId)}`);
  if (!currentResult.ok || !currentResult.data?.employee) return { ok: false, message: "I couldn't verify the employee before updating the record. Please try again.", statusCode: currentResult.status };
  const current = currentResult.data.employee as EmployeeSummary & Record<string, unknown>;
  if (Object.keys(patch).some((key) => String(current[key] ?? "") !== String(expected[key] ?? ""))) {
    return { ok: false, message: "The employee record changed after you reviewed this proposal. Please review the latest details and try again.", statusCode: 409 };
  }
  const updated = await managementJson<{ employee: EmployeeSummary }>(`/api/employees/${encodeURIComponent(employeeId)}`, {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...patch, expected }),
  });
  if (!updated.ok || !updated.data?.employee) return { ok: false, message: (updated.data as { error?: string } | null)?.error ?? "I couldn't update the employee because the management system returned an error.", statusCode: updated.status };
  const employee = updated.data.employee;
  return { ok: true, message: `Updated employee ${employee.fullName} (${employee.employeeId}).`, data: { employee } };
}

async function getEmployeePermissions(user: AgentUser, rawArgs: unknown): Promise<ToolExecutionResult> {
  if (user.role !== "admin") return { ok: false, permissionRequired: "ADMIN", message: "Only administrators can view employee permissions.", statusCode: 403 };
  const args = employeePermissionsQuerySchema.parse(asRecord(rawArgs));
  if (args.employee) {
    const resolved = await resolveEmployee(user, args.employee);
    if (!resolved.employee) return { ok: false, message: resolved.error ?? "I couldn't identify that employee.", data: resolved.candidates };
    const [result, catalog] = await Promise.all([
      managementJson<Record<string, unknown>>(`/api/admin/permissions/${encodeURIComponent(resolved.employee.employeeId)}`),
      managementJson<{ keys?: string[]; permissions?: Array<{ key: string; label?: string; description?: string; category?: string }> }>(`/api/admin/permissions/catalog`),
    ]);
    if (!result.ok || !result.data) return { ok: false, message: (result.data as { error?: string } | null)?.error ?? "I couldn't retrieve that employee's permissions.", statusCode: result.status };
    const permissions = asRecord(result.data.permissions);
    const availablePermissionKeys = catalog.data?.keys?.length ? catalog.data.keys : Object.keys(permissions);
    const permissionCatalog = catalog.data?.permissions ?? [];
    const selected = args.permissionKey ? { [args.permissionKey]: permissions[args.permissionKey] } : permissions;
    if (args.permissionKey && !Object.prototype.hasOwnProperty.call(permissions, args.permissionKey)) {
      return { ok: false, message: "That permission is not part of the current permission model. Available permission keys are included in the result.", data: { availablePermissionKeys, permissionCatalog } };
    }
    return { ok: true, message: `Retrieved permissions for ${resolved.employee.fullName}.`, data: { employee: result.data.employee, permissions: selected, availablePermissionKeys, permissionCatalog } };
  }
  const [listed, catalog] = await Promise.all([
    managementJson<{ employees: Array<Record<string, unknown>> }>(`/api/admin/permissions/employees?includePermissions=true&search=${encodeURIComponent(args.search ?? "")}`),
    managementJson<{ keys?: string[]; permissions?: Array<{ key: string; label?: string; description?: string; category?: string }> }>(`/api/admin/permissions/catalog`),
  ]);
  if (!listed.ok || !listed.data) return { ok: false, message: (listed.data as { error?: string } | null)?.error ?? "I couldn't retrieve employee permissions.", statusCode: listed.status };
  let employees = listed.data.employees ?? [];
  const availablePermissionKeys = catalog.data?.keys?.length ? catalog.data.keys : Object.keys(asRecord(employees[0]?.permissions));
  const permissionCatalog = catalog.data?.permissions ?? [];
  if (args.permissionKey && availablePermissionKeys.length && !availablePermissionKeys.includes(args.permissionKey)) {
    return { ok: false, message: "That permission is not part of the current permission model. Available permission keys are included in the result.", data: { availablePermissionKeys, permissionCatalog } };
  }
  if (args.permissionKey) {
    employees = employees.filter((employee) => asRecord(employee.permissions)[args.permissionKey!] === true);
  }
  return { ok: true, message: `Retrieved ${employees.length} employee permission record${employees.length === 1 ? "" : "s"}.`, data: { employees, availablePermissionKeys, permissionCatalog } };
}

async function proposePermissionChange(user: AgentUser, rawArgs: unknown): Promise<ToolExecutionResult> {
  if (user.role !== "admin") return { ok: false, permissionRequired: "ADMIN", message: "Only administrators can change employee permissions.", statusCode: 403 };
  const args = permissionChangeSchema.parse(asRecord(rawArgs));
  const resolved = await resolveEmployee(user, args.employee);
  if (!resolved.employee) return { ok: false, message: resolved.error ?? "I couldn't identify that employee.", data: resolved.candidates };
  const result = await managementJson<Record<string, unknown>>(`/api/admin/permissions/${encodeURIComponent(resolved.employee.employeeId)}`);
  if (!result.ok || !result.data) return { ok: false, message: (result.data as { error?: string } | null)?.error ?? "I couldn't retrieve the current permissions.", statusCode: result.status };
  const permissions = asRecord(result.data.permissions);
  const requestedKeys = "revokeAll" in args && args.revokeAll === true
    ? Object.keys(permissions).filter((key) => permissions[key] === true)
    : args.permissionKeys ?? (args.permissionKey ? [args.permissionKey] : []);
  if (!requestedKeys.length) return { ok: true, message: `${resolved.employee.fullName} has no permissions to remove.`, data: { employeeId: resolved.employee.employeeId, permissionKeys: [] } };
  const invalidKeys = requestedKeys.filter((key) => !Object.prototype.hasOwnProperty.call(permissions, key));
  if (invalidKeys.length) {
    return { ok: false, message: "One or more permissions are not part of the current permission model. Ask me to show the employee's permissions to see valid keys.", data: { availablePermissionKeys: Object.keys(permissions) } };
  }
  const expectedPermissions = { ...permissions };
  const changes = Object.fromEntries(requestedKeys.map((key) => [key, args.granted]));
  const changedKeys = requestedKeys.filter((key) => (permissions[key] === true) !== args.granted);
  if (!changedKeys.length) return { ok: true, message: `${resolved.employee.fullName} already has that permission state.`, data: { employeeId: resolved.employee.employeeId, permissionKeys: requestedKeys, granted: args.granted } };
  const summary = [
    { label: "Employee", value: `${resolved.employee.fullName} (${resolved.employee.employeeId})` },
    ...changedKeys.map((key) => ({ label: "Permission", value: `${key}: ${(permissions[key] === true) ? "Granted" : "Not granted"} → ${args.granted ? "Granted" : "Removed"}` })),
  ];
  const proposal = createProposal(user, "update_employee_permissions", {
    employeeId: resolved.employee.employeeId,
    permissionChanges: changes,
    expectedPermissions,
  }, summary);
  return { ok: true, message: "Review the permission change and confirm to apply it.", data: { proposalId: proposal.id, summary: proposal.summary, expiresAt: new Date(proposal.expiresAt).toISOString() } };
}

async function updateEmployeePermissions(user: AgentUser, rawArgs: unknown): Promise<ToolExecutionResult> {
  if (user.role !== "admin") return { ok: false, permissionRequired: "ADMIN", message: "Only administrators can change employee permissions.", statusCode: 403 };
  const args = asRecord(rawArgs);
  const employeeId = String(args.employeeId ?? "");
  const permissionChanges = asRecord(args.permissionChanges);
  const expectedPermissions = asRecord(args.expectedPermissions);
  const current = await managementJson<Record<string, unknown>>(`/api/admin/permissions/${encodeURIComponent(employeeId)}`);
  if (!current.ok || !current.data) return { ok: false, message: (current.data as { error?: string } | null)?.error ?? "I couldn't verify current permissions.", statusCode: current.status };
  const permissions = asRecord(current.data.permissions);
  if (Object.keys(permissions).some((key) => expectedPermissions[key] !== permissions[key])) {
    return { ok: false, message: "The employee permissions changed after you reviewed this proposal. Retrieve the latest permissions and try again.", statusCode: 409 };
  }
  for (const [key, granted] of Object.entries(permissionChanges)) {
    if (!Object.prototype.hasOwnProperty.call(permissions, key) || typeof granted !== "boolean") {
      return { ok: false, message: "One or more permissions in this proposal are no longer available." };
    }
    permissions[key] = granted;
  }
  const saved = await managementJson<Record<string, unknown>>(`/api/admin/permissions/${encodeURIComponent(employeeId)}`, {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ permissions, expectedPermissions }),
  });
  if (!saved.ok || !saved.data) return { ok: false, message: (saved.data as { error?: string } | null)?.error ?? "I couldn't save the permission change.", statusCode: saved.status };
  return { ok: true, message: `Updated permissions for ${employeeId}.`, data: saved.data };
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
    tools.push(tool("list_tasks", "List tasks visible to the user. Admins can retrieve all organization tasks or filter by employee, department, status, priority, due date and date range; employees are always restricted to their own tasks. Resolve employee names to actual employee IDs before filtering.", objectSchema({
      scope: { type: "string", enum: ["my_tasks", "employee_tasks", "department_tasks", "all_tasks"], description: "Task scope. Employees are always restricted to my_tasks." },
      employee: { type: "string", description: "Employee name, email or ID (admin only)." },
      employeeId: { type: "string", description: "Employee ID (admin only)." },
      employeeName: { type: "string", description: "Employee name to resolve to an employee ID (admin only)." },
      employees: { type: "array", items: { type: "string" }, description: "Multiple employee names or IDs (admin only)." },
      assignee: { type: "string", description: "Employee name, email or ID (admin only)." },
      assignedTo: { type: "string", description: "Employee ID (admin only)." },
      assignees: { type: "array", items: { type: "string" }, description: "Multiple employee names or IDs (admin only)." },
      department: { type: "string", description: "Department name or ID." },
      departmentId: { type: "string", description: "Department ID." },
      status: { type: "string", enum: ["Pending", "In Progress", "Completed", "Overdue"] },
      priority: { type: "string", enum: ["Low", "Medium", "High", "Urgent"] },
      due: { type: "string", enum: ["today", "overdue"] },
      dueDate: { type: "string", pattern: datePattern.source, description: "YYYY-MM-DD" },
      fromDate: { type: "string", pattern: datePattern.source, description: "Start of due-date range (YYYY-MM-DD)." },
      toDate: { type: "string", pattern: datePattern.source, description: "End of due-date range (YYYY-MM-DD)." },
      assignedToday: { type: "boolean" },
      completedToday: { type: "boolean" },
      search: { type: "string", description: "Match task ID, title, assignee or department." },
      limit: { type: "number", minimum: 1, maximum: 500 },
    })));
  }
  if (hasPermission(user, "EMPLOYEES_VIEW_DIRECTORY")) {
    tools.push(tool("search_employees", "List or search employee records visible to the user. Each record includes full name, email, employee ID, department ID/name, designation, account status (Active/Inactive) and joining date when available. Use this for employee counts, active vs inactive counts, department-wise counts, recent joiners and directory lookups. Pass search to filter by name, email, ID, department, designation or status. Pass a larger limit when counting or aggregating.", objectSchema({
      search: { type: "string", description: "Filter by name, email, employee ID, department name/ID, designation or account status." },
      limit: { type: "number", minimum: 1, maximum: 200 },
    })));
  }
  if (hasPermission(user, "DEPARTMENTS_VIEW")) {
    tools.push(tool("list_departments", "List departments visible to the user, including department ID, name, description, manager and status. Use this for department counts, department existence questions and department details.", objectSchema({
      search: { type: "string", description: "Filter by department name, ID, description or manager." },
      limit: { type: "number", minimum: 1, maximum: 200 },
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
    tools.push(tool("propose_revoke_all_permissions", "Propose removing every currently granted employee permission. Show the complete revocation scope and wait for administrator confirmation.", objectSchema({ employee: { type: "string" } }, ["employee"])));
    tools.push(tool("get_employee_permissions", "Retrieve actual employee permission grants from the Management System. Use this to list records, inspect valid permission keys or find employees with a specific key. Do not invent permission names.", objectSchema({
      employee: { type: "string", description: "Employee name or ID. Omit to list permission summaries." },
      permissionKey: { type: "string", description: "Exact key returned by the permission lookup." },
      search: { type: "string" },
    })));
    tools.push(tool("propose_permission_change", "Propose granting or removing one or more exact permission keys returned by the Management System. Always request confirmation before applying the change.", objectSchema({
      employee: { type: "string" }, permissionKey: { type: "string" }, permissionKeys: { type: "array", items: { type: "string" } }, granted: { type: "boolean" },
    }, ["employee", "granted"])));
    tools.push(tool("propose_create_department", "Propose a department creation. Ask for its name if missing; summarize the exact values and wait for administrator confirmation.", objectSchema({
      departmentName: { type: "string" }, description: { type: "string" }, manager: { type: "string" },
    }, ["departmentName"])));
    tools.push(tool("propose_update_department", "Find a real department and propose changing its name, description, manager or status. Preserve all unspecified values and wait for administrator confirmation.", objectSchema({
      department: { type: "string" }, departmentId: { type: "string" }, departmentName: { type: "string" }, description: { type: ["string", "null"] }, manager: { type: ["string", "null"] }, status: { type: "string", enum: ["Active", "Inactive"] },
    })));
    tools.push(tool("propose_update_employee", "Find a real employee and propose updating supported employee fields: name, email, department, designation, account status and joining date. Preserve unspecified values and wait for administrator confirmation.", objectSchema({
      employee: { type: "string" }, fullName: { type: "string" }, email: { type: "string" }, department: { type: "string" }, departmentId: { type: "string" }, designation: { type: ["string", "null"] }, accountStatus: { type: "string", enum: ["Active", "Inactive"] }, joiningDate: { type: ["string", "null"], pattern: datePattern.source },
    })));
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
    tools.push(tool("complete_task", "Propose marking a visible task as completed. The administrator or employee must confirm before the update is applied.", objectSchema({ taskId: { type: "string" } }, ["taskId"])));
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
  get_employee_permissions: (args, { user }) => getEmployeePermissions(user, args),
  propose_permission_change: (args, { user }) => proposePermissionChange(user, args),
  propose_revoke_all_permissions: (args, { user }) => proposePermissionChange(user, { ...asRecord(args), granted: false, revokeAll: true }),
  propose_create_department: (args, { user }) => proposeCreateDepartment(user, args),
  create_department: (args, { user }) => createDepartment(user, args),
  propose_update_department: (args, { user }) => proposeUpdateDepartment(user, args),
  update_department: (args, { user }) => updateDepartment(user, args),
  propose_update_employee: (args, { user }) => proposeUpdateEmployee(user, args),
  update_employee: (args, { user }) => updateEmployee(user, args),
  update_employee_permissions: (args, { user }) => updateEmployeePermissions(user, args),
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
    if (error instanceof ManagementDataError) {
      const message = error.status === 403
        ? `You do not have permission to view ${error.resource}.`
        : `The Management System could not retrieve ${error.resource}. Please try again.`;
      return { ok: false, message, statusCode: error.status };
    }
    console.error(`Tool ${name} failed`, error);
    return { ok: false, message: "The operation failed. Please try again." };
  }
}

export function publicToolNames(user: AgentUser): string[] {
  return buildToolDefinitions(user).map((definition) => definition.function.name);
}

