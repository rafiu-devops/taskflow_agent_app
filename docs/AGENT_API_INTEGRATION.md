# Agent API Integration — TaskFlow Management Backend

Base URL (agent server-side only): `MANAGEMENT_APP_URL` (example: `http://localhost:3000`).

Authentication: the agent forwards the browser's `taskflow_session` cookie to management APIs server-to-server. The browser never talks directly to management and never receives management secrets.

Common error envelope: `{ "error": "message" }` with appropriate status code.

---

## GET `/api/me`

- Purpose: verify session; resolve role, employeeId, departmentId and current permission map.
- Required authentication: valid `taskflow_session` cookie.
- Required permission: authenticated active account.
- Request schema: none.
- Success response:
  ```json
  {
    "user": {
      "email": "string",
      "name": "string",
      "role": "admin | employee",
      "employeeId": "EMP-000 | null",
      "departmentId": "DEP-000 | null",
      "permissions": { "TASKS_VIEW_MY": true }
    }
  }
  ```
- Errors: `401` unauthenticated; `403` forbidden (unregistered/inactive employee); `503` authorization unavailable.
- Agent use: every protected page/API route; tool permission filtering; role-aware UI.

## POST `/api/auth/signin`

- Purpose: sign in with email (management's existing auth flow).
- Required authentication: none.
- Required permission: n/a.
- Request schema: `{ "email": "string" }`
- Success response: `{ "ok": true, "role": "admin" | "employee" }`; sets HTTP-only `taskflow_session` cookie.
- Errors: `401 {"error":"Not authorised"}`; `503`; `500`.
- Agent use: `POST /api/auth/signin` proxy; agent forwards `Set-Cookie` to the browser.

## POST `/api/auth/logout`

- Purpose: destroy session cookie.
- Request schema: none.
- Success response: `{ "ok": true }`.
- Agent use: logout button; agent proxy clears/forwards deletion.

## GET `/api/tasks`

- Purpose: list tasks visible to the caller.
- Required authentication: valid session.
- Required permission: one of `TASKS_VIEW_MY`, `TASKS_VIEW_DEPARTMENT`, `TASKS_VIEW_ALL`.
- Request schema: none.
- Success response:
  ```json
  {
    "tasks": [
      {
        "taskId": "TASK-001",
        "title": "string",
        "assignedTo": "EMP-000 | null",
        "assignedBy": "string | null",
        "departmentId": "DEP-000 | null",
        "priority": "Low | Medium | High | Urgent | null",
        "status": "Pending | In Progress | Completed | Overdue | null",
        "dueDate": "string | null",
        "assignedDate": "string | null",
        "completionDate": "string | null",
        "progressPercentage": "number | null",
        "remarks": "string | null",
        "createdAt": "string | null",
        "updatedAt": "string | null"
      }
    ],
    "scope": "own | department | all"
  }
  ```
- Errors: `401`; `403`; `503`; `500`.
- Agent use: task listing tools; agent filters by status/search/date after retrieval (management enforces scope).

## POST `/api/tasks`

- Purpose: create a task.
- Required authentication: valid session.
- Required permission: `TASKS_CREATE`.
- Request schema (validated by management):
  ```json
  {
    "title": "string (required)",
    "description": "string | null",
    "assignedTo": "EMP-000 | null",
    "departmentId": "DEP-000 | null",
    "priority": "Low | Medium | High | Urgent",
    "status": "Pending | In Progress | Completed | Overdue",
    "assignedDate": "YYYY-MM-DD | null",
    "dueDate": "YYYY-MM-DD | null",
    "progressPercentage": "0-100",
    "remarks": "string | null"
  }
  ```
- Success response: `201 { "task": { ... } }`.
- Errors: `400` validation; `401`; `403` permission/ownership; `409` workbook conflict; `500`.
- Agent use: Admin/Employee create-task tool. Agent resolves employee name → `Employee_ID` via `/api/employees` when possible; otherwise asks for clarification.

## PATCH `/api/tasks/[id]`

- Purpose: update a task.
- Required authentication: valid session.
- Required permission: field-dependent (see below); task must be in caller's scope.
- Request schema: partial task fields; restricted keys ignored.
  - Admin: any task fields.
  - Employee: `TASKS_EDIT` (title/description/due/assigned dates), `TASKS_ASSIGN` (assignedTo/departmentId), `TASKS_CHANGE_PRIORITY`, `TASKS_CHANGE_STATUS` / `TASKS_COMPLETE` (status transitions constrained), `TASKS_UPDATE_PROGRESS`, `TASKS_ADD_REMARKS`.
- Success response: `{ "task": { ... } }`.
- Errors: `400` invalid/no-op; `401`; `403`; `404` (out-of-scope tasks are hidden); `409` conflict; `500`.
- Agent use: update-progress, add-remarks, mark-complete, change-priority/status tools. Management remains authoritative.

## GET `/api/employees`

- Purpose: list visible employees.
- Required authentication: valid session.
- Required permission: `EMPLOYEES_VIEW_DIRECTORY`.
- Success response: `{ "employees": [ ... ] }`; admins receive full rows; employees receive fields gated by directory/details/contact permissions.
- Agent use: Admin employee search/assignment resolution; employee directory tool (permission-gated).

## GET `/api/departments`

- Purpose: list departments.
- Required authentication: valid session.
- Required permission: `DEPARTMENTS_VIEW`.
- Success response: `{ "departments": [ ... ] }`.
- Agent use: department insights; department filter options.

## GET `/api/performance`

- Purpose: performance rows visible to caller.
- Required authentication: valid session.
- Required permission: one of `PERFORMANCE_VIEW_MY`, `PERFORMANCE_VIEW_DEPARTMENT`, `PERFORMANCE_VIEW_ALL`.
- Success response: `{ "performance": [ ... ], "scope": "own | department | all" }`.
- Agent use: personal/team performance summaries (never fabricated).

## GET `/api/dashboard`

- Purpose: admin dashboard aggregation or employee dashboard summary.
- Required authentication: valid session.
- Required permission: `DASHBOARD_VIEW_PERSONAL` (admins implicitly have it).
- Admin query params: `from`, `to` (`YYYY-MM-DD`), `departmentId`, `employeeId`, `status`.
- Admin response includes `kpis`, `statusDistribution`, `departmentDistribution`, `completionTrend`, `recentTasks`, `overdueTasks`, `employeePerformance`, `employees`, `departments`, `generatedAt`.
- Employee response includes a minimal scoped summary (or `summary: null` when task statistics are not granted).
- Agent use: admin reporting tool; dashboard summaries; scoped insights.

## GET `/api/activity-logs`

- Purpose: audit/activity history.
- Required authentication: valid session.
- Required permission: `ACTIVITY_LOGS_VIEW` (organization) or `ACTIVITY_LOGS_VIEW_MY` (own).
- Success response: `{ "logs": [ ... ], "scope": "organization" | "own" }`.
- Agent use: optional admin audit-summary tool (permission-gated).

---

## Agent-specific APIs exposed by this app

### POST `/api/auth/signin`
Proxy to management signin; forwards `Set-Cookie` to browser.

### POST `/api/auth/logout`
Proxy to management logout; clears session.

### GET `/api/me`
Proxy/normalization for agent UI (role, employeeId, permissions).

### GET/POST `/api/conversations`
List/create authenticated user's conversations (file-backed, owner-hash scoped).

### GET/PATCH/DELETE `/api/conversations/[id]`
Load, rename or delete a conversation owned by the caller.

### POST `/api/agent/chat`
Body: `{ conversationId?, message }`. Verifies session, persists user message, runs tool-calling loop if `AI_API_KEY` is configured, persists assistant response/cards, returns structured payload.

## Security notes

- Agent never calls Google Drive or the workbook directly.
- Agent never accepts role/userId from the browser.
- Every agent tool call is re-checked against management APIs; management remains authoritative.
- Conversation data is scoped to a one-way hash of the management user email; other users cannot read it.
- Secrets (`AI_API_KEY`, management secrets) are server-only.
