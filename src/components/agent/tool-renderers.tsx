"use client";

import type { ChatCard, ToolResultPart } from "@/types/agent";
import MessageCards from "@/components/chat/Cards";
import TaskList from "./TaskList";
import ConfirmCard from "./ConfirmCard";
import EmployeeFormCard from "./EmployeeFormCard";
import ReportCard from "./ReportCard";
import ProgressTrace from "./ProgressTrace";
import ErrorNotice from "./ErrorNotice";

function DataCard({ part }: { part: ToolResultPart }) {
  const output = part.output && typeof part.output === "object" ? part.output as { card?: ChatCard } : {};
  return output.card ? <MessageCards cards={[output.card]} /> : null;
}

export const TOOL_RENDERERS: Record<string, (part: ToolResultPart, conversationId?: string | null) => React.ReactNode> = {
  list_tasks: (part) => <TaskList part={part} />,
  get_tasks: (part) => <TaskList part={part} />,
  propose_assign_task: (part) => <ConfirmCard part={part} />,
  propose_create_employee: (part, conversationId) => <EmployeeFormCard part={part} conversationId={conversationId ?? null} />,
  propose_update_task: (part) => <ConfirmCard part={part} />,
  complete_task: (part) => <ConfirmCard part={part} />,
  propose_create_department: (part) => <ConfirmCard part={part} />,
  propose_update_department: (part) => <ConfirmCard part={part} />,
  propose_update_employee: (part) => <ConfirmCard part={part} />,
  propose_permission_change: (part) => <ConfirmCard part={part} />,
  propose_revoke_all_permissions: (part) => <ConfirmCard part={part} />,
  search_employees: (part) => <DataCard part={part} />,
  list_departments: (part) => <DataCard part={part} />,
  get_performance: (part) => <DataCard part={part} />,
  get_dashboard: (part) => <DataCard part={part} />,
  get_report: (part) => <ReportCard part={part} />,
};

export function renderToolResult(part: ToolResultPart, onRetry?: () => void, conversationId?: string | null) {
  if (part.state === "error") {
    return <ErrorNotice part={part} onRetry={onRetry} />;
  }
  if (part.state === "running") {
    return <ProgressTrace part={part} />;
  }
  const renderer = TOOL_RENDERERS[part.tool];
  if (!renderer) return <ProgressTrace part={part} />;
  try {
    return renderer(part, conversationId);
  } catch {
    console.error("Tool renderer failed", part.tool);
    return null;
  }
}
