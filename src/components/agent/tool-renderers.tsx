"use client";

import type { ToolResultPart } from "@/types/agent";
import TaskList from "./TaskList";
import ConfirmCard from "./ConfirmCard";
import ReportCard from "./ReportCard";
import ProgressTrace from "./ProgressTrace";
import ErrorNotice from "./ErrorNotice";

export const TOOL_RENDERERS: Record<string, (part: ToolResultPart) => React.ReactNode> = {
  list_tasks: (part) => <TaskList part={part} />,
  get_tasks: (part) => <TaskList part={part} />,
  propose_assign_task: (part) => <ConfirmCard part={part} />,
  propose_update_task: (part) => <ConfirmCard part={part} />,
  get_report: (part) => <ReportCard part={part} />,
};

export function renderToolResult(part: ToolResultPart, onRetry?: () => void) {
  if (part.state === "error") {
    return <ErrorNotice part={part} onRetry={onRetry} />;
  }
  if (part.state === "running") {
    return <ProgressTrace part={part} />;
  }
  const renderer = TOOL_RENDERERS[part.tool];
  if (!renderer) return <ProgressTrace part={part} />;
  try {
    return renderer(part);
  } catch {
    console.error("Tool renderer failed", part.tool);
    return null;
  }
}
