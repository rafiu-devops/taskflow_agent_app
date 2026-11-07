"use client";

import { useState } from "react";
import { z } from "zod";
import type { ToolResultPart } from "@/types/agent";
import type { TaskSummary } from "@/types/agent";


const taskSchema = z.object({
  taskId: z.string(),
  title: z.string(),
  assignedName: z.string().nullable().optional(),
  assignedTo: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  priority: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  progressPercentage: z.number().nullable().optional(),
});

const outputSchema = z.object({
  tasks: z.array(taskSchema).optional(),
  total: z.number().optional(),
  card: z.object({ tasks: z.array(taskSchema).optional() }).optional(),
});

export default function TaskList({ part }: { part: ToolResultPart }) {
  const parsed = outputSchema.safeParse(part.output);
  const initialTasks = parsed.success ? (parsed.data.tasks ?? parsed.data.card?.tasks ?? []) : [];
  const [tasks, setTasks] = useState<TaskSummary[]>(initialTasks as TaskSummary[]);
  const [expanded, setExpanded] = useState(false);

  if (!parsed.success || !tasks.length) return null;

  const visible = expanded ? tasks : tasks.slice(0, 5);

  async function toggle(taskId: string) {
    const previous = tasks;
    setTasks((current) =>
      current.map((task) =>
        task.taskId === taskId ? { ...task, status: "Completed", progressPercentage: 100 } : task,
      ),
    );
    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "Completed", progressPercentage: 100 }),
      });
      if (!response.ok) throw new Error("Failed");
    } catch {
      setTasks(previous);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <h3 className="text-sm font-semibold text-[var(--ink)]">Tasks</h3>
        <span className="text-xs text-[var(--ink-muted)]">{tasks.length} tasks</span>
      </div>
      <ul className="divide-y divide-slate-100">
        {visible.map((task) => (
          <li key={task.taskId} className="flex items-center gap-3 px-4 py-3">
            <button
              type="button"
              onClick={() => toggle(task.taskId)}
              aria-label={`Mark ${task.title} done`}
              className="grid h-11 w-11 shrink-0 place-items-center sm:h-6 sm:w-6"
            >
              <span className="grid h-6 w-6 place-items-center rounded-md border border-slate-300 text-xs text-transparent transition hover:border-[var(--brand)]" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[var(--ink)]">{task.title}</p>
              <p className="text-[11px] text-[var(--ink-muted)]">{task.dueDate ? `Due ${task.dueDate}` : "No due date"}</p>
            </div>
            <span className="text-[11px] text-[var(--ink-muted)]">{task.priority ?? ""}</span>
            <span className="text-[11px] text-[var(--ink-muted)]">{task.status ?? ""}</span>
          </li>
        ))}
      </ul>
      {tasks.length > 5 && !expanded && (
        <button type="button" onClick={() => setExpanded(true)} className="w-full border-t border-[var(--border)] px-4 py-2 text-xs font-medium text-[var(--brand)]">
          Show {tasks.length - 5} more
        </button>
      )}
    </section>
  );
}
