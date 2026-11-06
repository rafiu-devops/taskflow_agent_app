# Implementation Notes

## What was created

- Next.js 16 App Router + TypeScript + Tailwind v4 application inside `taskflow_agent_app`.
- Screens: `/login`, `/home`, `/chat`, `/chat/[id]`, `/history`, `/settings`, `/offline`.
- PWA: manifest, icons, service worker (static assets only), offline fallback page, install prompt hook.
- Agent API routes: auth signin/logout proxy, `/api/me` proxy, conversation CRUD, `/api/agent/chat`.
- File-backed conversation store scoped by SHA-256 hash of management user email.
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

Employee (filtered by their actual grants):
- Task listing/scoping per `TASKS_VIEW_*`
- Create/update/complete per `TASKS_CREATE`, `TASKS_EDIT`, `TASKS_ASSIGN`, `TASKS_CHANGE_*`, `TASKS_UPDATE_PROGRESS`, `TASKS_COMPLETE`, `TASKS_ADD_REMARKS`
- Directory/department/performance/activity tools per corresponding permissions

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

- Conversation store is local disk (single instance). Use a database for multi-instance deployments.
- Email-only auth inherited from management app; add SSO there before exposing to the public internet.
- AI quality depends on configured provider/model; tool calling requires a tool-capable model.
