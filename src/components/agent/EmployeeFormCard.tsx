"use client";

import { useState } from "react";
import { z } from "zod";
import type { ChatEmployeeFormCard, ToolResultPart } from "@/types/agent";
import ConfirmCard from "./ConfirmCard";

const employeeFormCardSchema = z.object({
  card: z.object({
    type: z.literal("employee_form"),
    title: z.string(),
    message: z.string(),
    fields: z.array(
      z.object({
        key: z.string(),
        label: z.string(),
        type: z.enum(["text", "email", "date", "select"]),
        required: z.boolean(),
        options: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
        defaultValue: z.string().optional(),
        placeholder: z.string().optional(),
        help: z.string().optional(),
      }),
    ),
  }).optional(),
});

export default function EmployeeFormCard({ part, conversationId }: { part: ToolResultPart; conversationId?: string | null }) {
  const parsed = employeeFormCardSchema.safeParse(part.output);
  const card: ChatEmployeeFormCard | undefined = parsed.success ? parsed.data?.card : undefined;
  if (!card || card.type !== "employee_form") {
    return <ConfirmCard part={part} />;
  }
  return <EmployeeFormCardBody card={card} conversationId={conversationId ?? null} />;
}

function EmployeeFormCardBody({ card, conversationId }: { card: ChatEmployeeFormCard; conversationId: string | null }) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const field of card.fields) {
      initial[field.key] = field.defaultValue ?? "";
    }
    return initial;
  });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ message: string; details: Array<{ label: string; value: string }> } | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [busy, setBusy] = useState(false);

  function setValue(key: string, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function initialValues() {
    return Object.fromEntries(card.fields.map((field) => [field.key, field.defaultValue ?? ""]));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const collected: Record<string, string> = {};
    for (const field of card.fields) {
      const value = (values[field.key] ?? "").trim();
      if (field.type === "select") {
        if (value && !field.options?.some((option) => option.value === value)) {
          setError(`Please select a valid ${field.label.toLowerCase()}.`);
          return;
        }
        if (field.required && !value) {
          setError(`Please provide the ${field.label}.`);
          return;
        }
        if (value) collected[field.key] = value;
        continue;
      }
      if (field.required && !value) {
        setError(`Please provide the ${field.label}.`);
        return;
      }
      if (value) collected[field.key] = value;
    }
    if (!collected.fullName) {
      setError("Full name is required.");
      return;
    }
    if (!collected.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(collected.email)) {
      setError("Enter a valid work email.");
      return;
    }

    setError(null);
    try {
      const response = await fetch("/api/employees", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Unable to verify employee details.");
      }
      const existingEmployees = Array.isArray(data.employees) ? data.employees as Array<Record<string, unknown>> : [];
      const duplicateEmail = existingEmployees.find(
        (employee) => typeof employee.email === "string" && employee.email.trim().toLowerCase() === collected.email.toLowerCase(),
      );
      if (duplicateEmail) {
        setError(`An employee with the email ${collected.email} already exists.`);
        return;
      }
      const employeeId = collected.employeeId?.trim();
      const duplicateId = employeeId && existingEmployees.some(
        (employee) => typeof employee.employeeId === "string" && employee.employeeId.trim().toLowerCase() === employeeId.toLowerCase(),
      );
      if (duplicateId) {
        setError(`An employee with the ID ${employeeId} already exists.`);
        return;
      }
      setReviewing(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to verify employee details.");
    }
  }

  async function confirmCreate() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/agent/employee", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId, employee: values }),
      });
      const data = await response.json().catch(() => ({}));
      const result = data.result && typeof data.result === "object" ? data.result as Record<string, unknown> : null;
      const message = typeof result?.message === "string" ? result.message : "Unable to create the employee.";
      if (!response.ok || data.ok !== true || result?.ok !== true) {
        throw new Error(typeof data.error === "string" ? data.error : message);
      }
      const resultData = result.data && typeof result.data === "object" ? result.data as Record<string, unknown> : {};
      const employee = resultData.employee && typeof resultData.employee === "object" ? resultData.employee as Record<string, unknown> : {};
      const details: Array<{ label: string; value: string }> = [];
      for (const [key, label] of [
        ["employeeId", "Employee ID"],
        ["fullName", "Name"],
        ["departmentName", "Department"],
        ["departmentId", "Department ID"],
        ["designation", "Designation"],
        ["email", "Work email"],
        ["accountStatus", "Status"],
      ]) {
        if (typeof employee[key] === "string" && employee[key]) details.push({ label, value: employee[key] as string });
      }
      setDone({ message, details });
    } catch (reason) {
      setReviewing(false);
      setError(reason instanceof Error ? reason.message : "Unable to create the employee.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-sm font-semibold text-emerald-800">{done.message}</p>
        {done.details.length > 0 && (
          <dl className="mt-3 space-y-1">
            {done.details.map((item) => (
              <div key={item.label} className="flex flex-wrap justify-between gap-x-4 text-xs">
                <dt className="text-emerald-700">{item.label}</dt>
                <dd className="font-medium text-emerald-900">{item.value}</dd>
              </div>
            ))}
          </dl>
        )}
        <button type="button" className="mt-3 rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white" onClick={() => { setDone(null); setValues(initialValues()); }}>
          Add another
        </button>
      </section>
    );
  }

  if (cancelled) {
    return (
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <p className="text-sm text-[var(--ink-muted)]">Employee creation cancelled. No record was saved.</p>
        <button type="button" className="mt-3 rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--ink-muted)]" onClick={() => setCancelled(false)}>
          Back to the form
        </button>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-[var(--ink)]">{card.title}</h3>
        <p className="text-sm text-[var(--ink-muted)]">{card.message}</p>
      </div>
      {reviewing ? (
        <div className="mt-4">
          <h4 className="text-sm font-semibold text-[var(--ink)]">Review employee details</h4>
          <dl className="mt-3 space-y-2">
            {card.fields.map((field) => {
              const value = values[field.key] ?? "";
              const optionLabel = field.options?.find((option) => option.value === value)?.label;
              const displayValue = field.key === "employeeId" && !value
                ? "Assigned automatically by the management system"
                : field.key === "departmentId" && optionLabel
                  ? `${optionLabel} (${value})`
                : optionLabel ?? (value || "Not provided");
              return (
                <div key={field.key} className="flex flex-wrap justify-between gap-x-4 border-b border-[var(--border)]/70 pb-2 text-sm">
                  <dt className="text-[var(--ink-muted)]">{field.label}</dt>
                  <dd className="text-right font-medium text-[var(--ink)]">{displayValue}</dd>
                </div>
              );
            })}
          </dl>
          {error ? <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={confirmCreate} disabled={busy} className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {busy ? "Creating..." : "Confirm and create"}
            </button>
            <button type="button" onClick={() => { setReviewing(false); setError(null); }} disabled={busy} className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--ink-muted)]">
              Edit
            </button>
            <button type="button" onClick={() => { setCancelled(true); setReviewing(false); }} disabled={busy} className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--ink-muted)]">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          {card.fields.map((field) => (
            <label key={field.key} className="block">
              <span className="text-xs font-semibold text-[var(--ink-muted)]">
                {field.label}
                {field.required ? " *" : ""}
              </span>
              {field.type === "select" ? (
                <select
                  required={field.required}
                  value={values[field.key] ?? ""}
                  onChange={(event) => setValue(field.key, event.target.value)}
                  className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] outline-none"
                >
                  <option value="">Select {field.label.toLowerCase()}</option>
                  {field.options?.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.type === "email" ? "email" : field.type === "date" ? "date" : "text"}
                  required={field.required}
                  value={values[field.key] ?? ""}
                  placeholder={field.placeholder}
                  onChange={(event) => setValue(field.key, event.target.value)}
                  className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] outline-none"
                />
              )}
              {field.key === "departmentId" && values[field.key] ? (
                <span className="mt-1 block text-xs text-[var(--ink-muted)]">Department ID: {values[field.key]}</span>
              ) : null}
              {field.help ? <span className="mt-1 block text-xs text-[var(--ink-muted)]">{field.help}</span> : null}
            </label>
          ))}
          {error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              Review details
            </button>
            <button type="button" onClick={() => { setValues(initialValues()); setError(null); }} className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--ink-muted)]">
              Clear
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
