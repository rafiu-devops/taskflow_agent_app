export type UserRole = "admin" | "employee";

export interface AgentUser {
  email: string;
  name: string;
  role: UserRole;
  employeeId: string | null;
  departmentId: string | null;
  permissions: Record<string, boolean>;
}

export type TaskPriority = "Low" | "Medium" | "High" | "Urgent";
export type TaskStatus = "Pending" | "In Progress" | "Completed" | "Overdue";

export interface TaskSummary {
  taskId: string;
  title: string;
  assignedTo: string | null;
  assignedName?: string | null;
  departmentId: string | null;
  departmentName?: string | null;
  priority: TaskPriority | string | null;
  status: TaskStatus | string | null;
  dueDate: string | null;
  completionDate?: string | null;
  progressPercentage: number | null;
  remarks?: string | null;
}

export interface EmployeeSummary {
  employeeId: string;
  fullName: string;
  email: string | null;
  departmentId: string | null;
  departmentName?: string | null;
  designation: string | null;
  accountStatus: string | null;
}

export interface DepartmentSummary {
  departmentId: string;
  departmentName: string;
  description?: string | null;
  manager?: string | null;
  status?: string | null;
}

export interface ChatTaskCard {
  type: "tasks";
  title: string;
  subtitle?: string;
  tasks: TaskSummary[];
  total: number;
  emptyMessage?: string;
}

export interface ChatPerformanceCard {
  type: "performance";
  title: string;
  subtitle?: string;
  metrics: Array<{ label: string; value: string; note?: string }>;
  rows?: Array<{ name: string; assigned?: number; completed?: number; overdue?: number; completionRate?: number }>;
}

export interface ChatConfirmationCard {
  type: "confirmation";
  title: string;
  message: string;
  operation: string;
  task?: TaskSummary;
  employee?: EmployeeSummary;
  timestamp: string;
}

export interface ChatEmployeesCard {
  type: "employees";
  title: string;
  employees: EmployeeSummary[];
  total: number;
  emptyMessage?: string;
}

export interface ChatDepartmentsCard {
  type: "departments";
  title: string;
  departments: DepartmentSummary[];
  emptyMessage?: string;
}

export interface ChatEmployeeFormField {
  key: string;
  label: string;
  type: "text" | "email" | "date" | "select";
  required: boolean;
  options?: Array<{ label: string; value: string }>;
  defaultValue?: string;
  placeholder?: string;
  help?: string;
}

export interface ChatEmployeeFormCard {
  type: "employee_form";
  title: string;
  message: string;
  fields: ChatEmployeeFormField[];
}

export interface ChatNoticeCard {
  type: "notice";
  tone: "info" | "warning" | "error" | "success";
  title?: string;
  message: string;
}

export type ChatCard =
  | ChatTaskCard
  | ChatPerformanceCard
  | ChatConfirmationCard
  | ChatEmployeesCard
  | ChatDepartmentsCard
  | ChatEmployeeFormCard
  | ChatNoticeCard;

export type TextPart = { type: "text"; text: string };
export type ToolResultPart = {
  type: "tool-result";
  id: string;
  tool: string;
  state: "running" | "done" | "error";
  input?: unknown;
  output?: unknown;
  error?: { message: string; retryable: boolean };
};
export type MessagePart = TextPart | ToolResultPart;

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  parts: MessagePart[];
  createdAt: number;
}

export interface Conversation {
  id: string;
  ownerId: string;
  ownerEmail?: string;
  role?: UserRole;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

export type ConversationSummary = Omit<Conversation, "messages"> & {
  messageCount: number;
  lastMessage?: string;
};

