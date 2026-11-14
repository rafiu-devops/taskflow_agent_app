# Existing Backend Analysis — TaskFlow Management Application

## Architecture summary

- Project: `taskflow_ai_agent` — Next.js App Router + TypeScript.
- Data source: Google Drive-hosted Excel workbook (`TaskFlow_AI_Workbook.xlsx`), read/written server-side through Google Drive API and ExcelJS.
- Workbook sheets include: `Employees`, `Departments`, `Tasks`, `Performance`, `Activity_Logs`, `Permission_Management`, plus reference sheets.
- Management app is the single source of truth for employee identity, roles, permissions, tasks, departments and activity logs.
- No separate database is required for this PWA.

## Authentication flow

- Management login is email-only (development placeholder; no password).
- `POST /api/auth/signin` accepts `{ email }`.
- Admin identity: email is matched case-insensitively against `ADMIN_EMAILS` (comma-separated environment variable).
- Employee identity: email is matched against the `Email` field in the `Employees` worksheet.
- Employees must have `Account_Status = Active` (case-insensitive) to sign in.
- Unknown or inactive accounts are rejected with HTTP 401.
- Management session is stored in an HTTP-only cookie named `taskflow_session`.
- The cookie is AES-256-GCM encrypted JSON containing the user's email/name/role/employeeId.

## Role identification flow

```text
Authenticated cookie email
→ Normalize email (trim + lowercase)
→ Match ADMIN_EMAILS?
  → yes: role = admin (full application permission set)
  → no: find employee by Email in Employees sheet
       → missing or not Active: deny
       → active: role = employee; load Permission_Management grants
```

Admins are not demoted by employee permission records.

## Permission-checking flow

- Permissions are stored persistently in the `Permission_Management` workbook table (`tblPermissionManagement`).
- Admin effective permissions are all employee-feature permissions set to true.
- Employee effective permissions are read from the latest record per permission key.
- Backend routes call `requirePermission`, `requireAnyPermission`, `requireAdmin` or `requireAuthenticatedUser`; frontend permission UI is not trusted.
- Missing or unreadable permission data denies protected access.
- Revoked permissions apply to subsequent requests (no stale frontend trust).

Relevant employee permission keys include:

- `TASKS_VIEW_MY`, `TASKS_VIEW_DEPARTMENT`, `TASKS_VIEW_ALL`
- `TASKS_CREATE`, `TASKS_EDIT`, `TASKS_ASSIGN`, `TASKS_CHANGE_PRIORITY`, `TASKS_CHANGE_STATUS`, `TASKS_UPDATE_PROGRESS`, `TASKS_COMPLETE`, `TASKS_ADD_REMARKS`
- `EMPLOYEES_VIEW_DIRECTORY`, `EMPLOYEES_VIEW_DETAILS`, `EMPLOYEES_VIEW_CONTACT`
- `DEPARTMENTS_VIEW`, `DEPARTMENTS_VIEW_DETAILS`
- `PERFORMANCE_VIEW_MY`, `PERFORMANCE_VIEW_DEPARTMENT`, `PERFORMANCE_VIEW_ALL`
- `REPORTS_VIEW_DASHBOARD`, `REPORTS_VIEW_DEPARTMENT`, `REPORTS_VIEW_ALL`
- `ACTIVITY_LOGS_VIEW`, `ACTIVITY_LOGS_VIEW_MY`
- `ASSISTANT_EMPLOYEE_ACCESS`, `ASSISTANT_TASK_TOOLS`, `ASSISTANT_PERFORMANCE_TOOLS`, `ASSISTANT_DEPARTMENT_TOOLS`

## Existing API endpoints used by the agent

See `docs/AGENT_API_INTEGRATION.md` for the request/response inventory.

Summary:

- `/api/auth/signin`, `/api/auth/logout`, `/api/me`
- `/api/tasks`, `/api/tasks/[id]`
- `/api/employees`, `/api/departments`
- `/api/performance`, `/api/dashboard`, `/api/activity-logs`
- `/api/admin/permissions/*` (admin-only; not exposed as agent tools)

## Available task operations

- List tasks scoped by the caller's role and permissions.
- Create tasks (admin: full fields; employees: self/own department unless granted assignment rights).
- Update tasks via `PATCH /api/tasks/[id]` with server-side ownership and field-level permission checks.
- Complete tasks by setting `status=Completed` when permitted.
- Admin mutations are logged to `Activity_Logs`; employee update logging is implemented for changed fields.

## Available employee/reporting operations

- Admin dashboard endpoint returns live KPI/chart data, recent tasks, overdue tasks and employee performance.
- Performance endpoint returns scoped performance rows.
- Directory endpoints return basic/detail/contact fields depending on permissions.
- Employee creation: `POST /api/employees` (admin-only) writes a new row to the `Employees` worksheet via the Excel service; duplicates (email/ID) return `409`.
- No salary/attendance/payroll/shift endpoints exist and the agent must not invent them.

## Missing APIs required by the AI agent

- No separate agent token service is required for same-site/local deployment: the agent backend proxies browser requests and forwards the existing encrypted `taskflow_session` cookie to management APIs server-to-server.
- No Management conversation/history API exists; the agent app stores conversations in the Firestore `taskflow_chats` collection, scoped by a one-way hash of the management user email.
- No public service-account/delegated-user flow exists; the agent never bypasses management APIs and never reads Google Drive directly.
- No streaming endpoint exists; agent responses are JSON.

## Recommended secure integration approach

1. Browser talks only to the TaskFlow Agent PWA.
2. Agent API routes verify the incoming session by calling management `/api/me` with the incoming cookie.
3. Agent server-to-server calls management APIs with the same cookie.
4. Management remains authoritative for identity, permissions and ownership.
5. Agent enforces its own tool availability before calling management; management enforces again.
6. No management secrets are shipped to the browser; only `MANAGEMENT_APP_URL` and `AI_API_KEY` are configured on the agent server.
7. For same-site deployment, no management changes are required.

## Environment variable names used (values intentionally omitted)

Management app (read by agent through API only): `ADMIN_EMAILS`, `SESSION_SECRET`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_DRIVE_FILE_ID`, `NODE_ENV`.

Agent app: `MANAGEMENT_APP_URL`, `AI_API_KEY`, `AI_API_BASE_URL`, `AI_MODEL`, `APP_URL` (optional), `CONVERSATION_DATA_FILE` (optional).
