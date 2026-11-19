import type { AgentUser } from "@/types/agent";
import { hasAnyPermission, hasPermission } from "@/lib/permissions";

/** Icon keys resolved to Lucide components by the presentation layer. */
export type QuickActionIcon =
  | "employees"
  | "tasks"
  | "performance"
  | "departments"
  | "reports"
  | "overdue"
  | "progress"
  | "add-employee";

export type QuickActionAccent =
  | "blue"
  | "green"
  | "violet"
  | "cyan"
  | "amber"
  | "rose"
  | "indigo"
  | "teal";

export type QuickAction = {
  id: string;
  title: string;
  description: string;
  /** Real prompt routed through the existing agent chat workflow. */
  prompt: string;
  icon: QuickActionIcon;
  accent: QuickActionAccent;
  /** Renders full-width on the two-column mobile grid. */
  wide?: boolean;
};

type Definition = QuickAction & {
  /** Permission gate — every action is filtered by the signed-in user's grants. */
  show: (user: AgentUser) => boolean;
};

const TASK_VIEWER = ["TASKS_VIEW_MY", "TASKS_VIEW_DEPARTMENT", "TASKS_VIEW_ALL"] as const;
const PERFORMANCE_VIEWER = [
  "PERFORMANCE_VIEW_MY",
  "PERFORMANCE_VIEW_DEPARTMENT",
  "PERFORMANCE_VIEW_ALL",
] as const;
const REPORT_VIEWER = [
  "REPORTS_VIEW_DASHBOARD",
  "REPORTS_VIEW_DEPARTMENT",
  "REPORTS_VIEW_ALL",
  "DASHBOARD_VIEW_PERSONAL",
] as const;

/**
 * Ordered catalogue of quick actions. Order decides which actions survive the
 * per-user slice, so the most useful permission-gated actions come first.
 */
const DEFINITIONS: Definition[] = [
  {
    id: "employees",
    title: "View Employees",
    description: "Browse the team directory.",
    prompt: "Show me the employee directory",
    icon: "employees",
    accent: "blue",
    show: (user) => hasPermission(user, "EMPLOYEES_VIEW_DIRECTORY"),
  },
  {
    id: "tasks",
    title: "Check Tasks",
    description: "Pending, in-progress and overdue work.",
    prompt: "Show all pending tasks",
    icon: "tasks",
    accent: "violet",
    show: (user) => hasAnyPermission(user, TASK_VIEWER),
  },
  {
    id: "performance",
    title: "View Performance",
    description: "Completion rates and trends.",
    // Rewritten per role in quickActionsForUser().
    prompt: "Show my performance",
    icon: "performance",
    accent: "green",
    show: (user) => hasAnyPermission(user, PERFORMANCE_VIEWER),
  },
  {
    id: "departments",
    title: "Our Departments",
    description: "Teams, managers and workload.",
    prompt: "Show our departments",
    icon: "departments",
    accent: "amber",
    show: (user) => hasPermission(user, "DEPARTMENTS_VIEW"),
  },
  {
    id: "reports",
    title: "Reports",
    description: "Summary of this month's work.",
    prompt: "Generate this month's task report",
    icon: "reports",
    accent: "indigo",
    show: (user) => hasAnyPermission(user, REPORT_VIEWER),
  },
  {
    id: "overdue",
    title: "Overdue Work",
    description: "Find blocked work that needs attention.",
    prompt: "Show overdue tasks",
    icon: "overdue",
    accent: "rose",
    show: (user) => hasAnyPermission(user, TASK_VIEWER),
  },
  {
    id: "progress",
    title: "Update Progress",
    description: "Move one of your tasks forward.",
    prompt: "Update my task progress to 70 percent",
    icon: "progress",
    accent: "teal",
    show: (user) => hasPermission(user, "TASKS_UPDATE_PROGRESS"),
  },
  {
    id: "add-employee",
    title: "Add Employee",
    description: "Register a new team member.",
    prompt: "I want to add an employee",
    icon: "add-employee",
    accent: "cyan",
    wide: true,
    show: (user) => user.role === "admin",
  },
];

const REGULAR_LIMIT = 4;

/**
 * Quick actions the signed-in user is actually authorised to run.
 * Admins get the full catalogue; employees only see granted actions.
 */
export function quickActionsForUser(user: AgentUser): QuickAction[] {
  const eligible = DEFINITIONS.filter((definition) => safeShow(definition, user));

  const regular = eligible.filter((definition) => !definition.wide).slice(0, REGULAR_LIMIT);
  const wide = eligible.filter((definition) => definition.wide);

  // The performance prompt differs per role, so it is resolved after filtering.
  const merged = [...regular, ...wide].map((definition) =>
    definition.id === "performance"
      ? {
          ...definition,
          prompt:
            user.role === "admin"
              ? "Show organization performance summary"
              : "Show my performance",
        }
      : definition,
  );

  // Strip the permission gate before handing the catalogue to the UI.
  return merged.map(({ id, title, description, prompt, icon, accent, wide }) => ({
    id,
    title,
    description,
    prompt,
    icon,
    accent,
    ...(wide ? { wide } : {}),
  }));
}

function safeShow(definition: Definition, user: AgentUser): boolean {
  try {
    return definition.show(user);
  } catch {
    return false;
  }
}
