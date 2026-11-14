# Implementation Notes

## Gemini integration

- AI provider is configured server-side through `AI_API_KEY`, `AI_BASE_URL`, and `AI_MODEL`.
- Defaults: Google AI Studio OpenAI-compatible endpoint (`https://generativelanguage.googleapis.com/v1beta/openai/`) and `gemini-3.1-flash-lite`, which supports function calling and is offered on the Gemini free tier with rate limits.
- Existing tool-calling architecture is preserved: Gemini only selects tools; the Node server executes them and re-checks management permissions/ownership before every backend call.
- If `AI_API_KEY` is missing, the agent returns a clear configuration error, not fabricated data.
- Free-tier availability/quotas can change; if `gemini-3.1-flash-lite` is not available to a project, switch `AI_MODEL` to another free-tier Gemini model with function-calling support listed in Google AI Studio.

## What was created

- Next.js 16 App Router + TypeScript + Tailwind v4 application inside `taskflow_agent_app`.
- Screens: `/login`, `/home`, `/chat`, `/chat/[id]`, `/history`, `/settings`, `/offline`.
- PWA: manifest, icons, service worker (static assets only), offline fallback page, install prompt hook.
- Agent API routes: auth signin/logout proxy, `/api/me` proxy, conversation CRUD, `/api/agent/chat`, and the Admin-only employee form submission route.
- Firestore conversation store scoped by SHA-256 hash of management user email.
- OpenAI-compatible tool-calling agent with server-side tools; permission-filtered per user.
- Role-aware Home UI, chat cards (tasks/performance/confirmation/employees/departments/notice), history grouping (Today/Yesterday/Previous) with rename/delete.

## What was reused

- Management backend APIs only (no workbook/Google Drive access from this app).
- Management session cookie (`taskflow_session`) forwarded server-to-server by the agent.
- Management permission system (employee grants in `Permission_Management` sheet; admins via `ADMIN_EMAILS`).

## Backend/API changes made to management app

None. All required functionality existed; conversations live in the agent app because the management workbook has no chat/history schema and should not be mutated for chat traffic.

## Agent tools (server-side)

Admin (all admin tools granted by management admin permission set):
- `list_tasks`, `search_employees`, `list_departments`, `get_dashboard`, `get_performance`, `get_activity_logs`
- `create_task`, `update_task`, `complete_task`
- `propose_create_employee` / `create_employee` (admin-only employee creation through the management API; form review and explicit confirmation required)

Employee (filtered by their actual grants):
- Task listing/scoping per `TASKS_VIEW_*`
- Create/update/complete per `TASKS_CREATE`, `TASKS_EDIT`, `TASKS_ASSIGN`, `TASKS_CHANGE_*`, `TASKS_UPDATE_PROGRESS`, `TASKS_COMPLETE`, `TASKS_ADD_REMARKS`
- Own performance per `PERFORMANCE_VIEW_MY`, filtered again by the authenticated employee ID
- Directory/department/activity tools per corresponding permissions

Management remains authoritative; tool visibility is only a first filter.

## Security model

- Browser ⇄ agent (httpOnly cookie set via agent proxy) ⇄ management (same cookie forwarded).
- Agent never stores Google credentials, workbook IDs, or management secrets.
- Agent never trusts client-sent userId/role.
- Conversation ownership check uses hashed owner id; cross-user access returns 404.
- API/auth/private traffic is network-only in the service worker; no private caching.

## Environment variables

See `.env.example`. No secrets are committed.

## Testing checklist (manual)

- [ ] Management app running with valid env.
- [ ] Agent app starts on another port.
- [ ] Admin sign-in → Home shows admin quick actions; unknown email → error.
- [ ] Employee sign-in → only permitted quick actions/features.
- [ ] With `AI_API_KEY` set: ask "Show pending tasks" → real backend data.
- [ ] Without `AI_API_KEY`: clear configuration error, no fabricated data.
- [ ] Employee cannot read another employee's chat (conversation 404).
- [ ] Rename/delete conversation works and persists across refresh.
- [ ] Production build + install prompt on supported browser.
- [ ] Offline navigation shows offline page; live actions show connection error.

## Known limitations

- The Management API contract does not include a contact-number field, so the agent does not collect or store one.
- The documented performance endpoint has no date-range filtering; monthly/history reporting is unavailable unless the Management API returns time-scoped records.
- Management sign-in is currently email-only and has no documented email-verification or invitation flow. The agent cannot add verification without a corresponding Management authentication API.
- Firebase Admin is used for Firestore conversations; authentication itself is delegated to the Management app's `taskflow_session` workflow. No Firebase Auth sign-in flow is present in this repository.
- AI quality depends on configured provider/model; tool calling requires a tool-capable model.
