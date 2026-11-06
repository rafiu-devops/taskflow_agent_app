import { AlertTriangle, CheckCircle2, ClipboardList, Info, Users, Building2, BarChart3 } from "lucide-react";
import type { ChatCard } from "@/types/agent";
import Badge from "@/components/ui/Badge";
import { formatDate, formatDateTime } from "@/lib/utils";

export default function MessageCards({ cards }: { cards: ChatCard[] }) {
  return (
    <div className="mt-3 space-y-3">
      {cards.map((card, index) => {
        switch (card.type) {
          case "tasks":
            return <TasksCard key={index} card={card} />;
          case "performance":
            return <PerformanceCard key={index} card={card} />;
          case "confirmation":
            return <ConfirmationCard key={index} card={card} />;
          case "employees":
            return <EmployeesCard key={index} card={card} />;
          case "departments":
            return <DepartmentsCard key={index} card={card} />;
          case "notice":
            return <NoticeCard key={index} card={card} />;
          default:
            return null;
        }
      })}
    </div>
  );
}

function Shell({ icon: Icon, title, subtitle, children }: { icon: typeof ClipboardList; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-3xl border border-line bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-line/70 bg-[#F7FBFE] px-4 py-3">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-navy text-cyan"><Icon className="h-4 w-4" aria-hidden="true" /></div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-navy">{title}</h3>
          {subtitle && <p className="text-[11px] text-muted">{subtitle}</p>}
        </div>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function TasksCard({ card }: { card: Extract<ChatCard, { type: "tasks" }> }) {
  if (!card.tasks.length) {
    return <Shell icon={ClipboardList} title={card.title} subtitle={card.subtitle}><EmptyState message={card.emptyMessage ?? "No tasks found."} /></Shell>;
  }
  return (
    <Shell icon={ClipboardList} title={card.title} subtitle={card.subtitle}>
      <ul className="divide-y divide-line/70">
        {card.tasks.map((task) => (
          <li key={task.taskId} className="py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 max-w-[68%]">
                <p className="text-sm font-semibold leading-5 text-navy">{task.title}</p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-muted">{task.taskId} · {task.assignedName || task.assignedTo || "Unassigned"}</p>
              </div>
              <div className="flex flex-wrap justify-end gap-1.5"><Badge value={task.priority} /><Badge value={task.status} /></div>
            </div>
            <div className="mt-3 flex items-center gap-3 text-[11px] text-muted">
              <span>Due {formatDate(task.dueDate)}</span>
              <div className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, task.progressPercentage ?? 0))}%` }} /></div>
              <span>{task.progressPercentage ?? 0}%</span>
            </div>
          </li>
        ))}
      </ul>
      {card.total > card.tasks.length && <p className="mt-3 text-[11px] text-muted">Showing first {card.tasks.length} of {card.total}. Refine your prompt to narrow the list.</p>}
    </Shell>
  );
}

function PerformanceCard({ card }: { card: Extract<ChatCard, { type: "performance" }> }) {
  return (
    <Shell icon={BarChart3} title={card.title} subtitle={card.subtitle}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {card.metrics.map((metric) => (
          <div key={metric.label} className="rounded-2xl bg-[#F7FBFE] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{metric.label}</p>
            <p className="mt-1 text-xl font-semibold text-navy">{metric.value}</p>
            {metric.note && <p className="mt-0.5 text-[10px] text-muted">{metric.note}</p>}
          </div>
        ))}
      </div>
      {card.rows && card.rows.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="text-muted"><tr><th className="py-2 pr-3">Employee</th><th className="py-2 pr-3">Assigned</th><th className="py-2 pr-3">Completed</th><th className="py-2 pr-3">Overdue</th><th className="py-2">Rate</th></tr></thead>
            <tbody className="divide-y divide-line/70 text-navy">
              {card.rows.map((row) => (
                <tr key={row.name}><td className="py-2 pr-3 font-medium">{row.name}</td><td className="py-2 pr-3">{row.assigned}</td><td className="py-2 pr-3">{row.completed}</td><td className="py-2 pr-3">{row.overdue}</td><td className="py-2">{row.completionRate}%</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}

function ConfirmationCard({ card }: { card: Extract<ChatCard, { type: "confirmation" }> }) {
  return (
    <Shell icon={CheckCircle2} title={card.title} subtitle={formatDateTime(card.timestamp)}>
      <p className="text-sm leading-6 text-navy">{card.message}</p>
      {card.task && (
        <div className="mt-3 rounded-2xl bg-emerald-50 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">{card.task.taskId}</p>
          <p className="mt-1 text-sm font-semibold text-emerald-900">{card.task.title}</p>
          <div className="mt-2 flex flex-wrap gap-2"><Badge value={card.task.priority} /><Badge value={card.task.status} /><span className="text-[11px] font-medium text-emerald-800">Due {formatDate(card.task.dueDate)}</span></div>
        </div>
      )}
    </Shell>
  );
}

function EmployeesCard({ card }: { card: Extract<ChatCard, { type: "employees" }> }) {
  if (!card.employees.length) return <Shell icon={Users} title={card.title}><EmptyState message={card.emptyMessage ?? "No employees found."} /></Shell>;
  return (
    <Shell icon={Users} title={card.title} subtitle={`Showing ${card.employees.length} of ${card.total}`}>
      <ul className="grid gap-2 sm:grid-cols-2">
        {card.employees.map((employee) => (
          <li key={employee.employeeId} className="rounded-2xl border border-line/70 bg-[#F7FBFE] p-3">
            <p className="text-sm font-semibold text-navy">{employee.fullName}</p>
            <p className="mt-0.5 text-[11px] text-muted">{employee.employeeId} · {employee.departmentName || employee.departmentId || "No department"}</p>
            <p className="mt-1 text-[11px] text-muted">{employee.email || "Contact hidden"}</p>
            <div className="mt-2"><Badge value={employee.accountStatus} /></div>
          </li>
        ))}
      </ul>
    </Shell>
  );
}

function DepartmentsCard({ card }: { card: Extract<ChatCard, { type: "departments" }> }) {
  if (!card.departments.length) return <Shell icon={Building2} title={card.title}><EmptyState message={card.emptyMessage ?? "No departments found."} /></Shell>;
  return (
    <Shell icon={Building2} title={card.title}>
      <ul className="divide-y divide-line/70">
        {card.departments.map((department) => (
          <li key={department.departmentId} className="flex items-center justify-between gap-3 py-2 text-sm">
            <div><p className="font-medium text-navy">{department.departmentName}</p><p className="text-[11px] text-muted">{department.departmentId}{department.manager ? ` · ${department.manager}` : ""}</p></div>
            <Badge value={department.status} />
          </li>
        ))}
      </ul>
    </Shell>
  );
}

function NoticeCard({ card }: { card: Extract<ChatCard, { type: "notice" }> }) {
  const tone = card.tone === "error" || card.tone === "warning" ? "border-amber-200 bg-amber-50 text-amber-800" : card.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-sky-200 bg-sky-50 text-sky-800";
  const Icon = card.tone === "success" ? CheckCircle2 : card.tone === "info" ? Info : AlertTriangle;
  return (
    <div role={card.tone === "error" ? "alert" : "status"} className={`flex items-start gap-2 rounded-2xl border p-3 text-sm leading-6 ${tone}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div>{card.title && <p className="font-semibold">{card.title}</p>}<p>{card.message}</p></div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="py-4 text-center text-sm text-muted">{message}</p>;
}
