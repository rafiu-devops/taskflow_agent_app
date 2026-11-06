# TaskFlow AI Agent

A mobile-first, installable PWA that lets TaskFlow admins and employees interact with the existing TaskFlow management system using natural language. The management application remains the single source of truth for identity, permissions, tasks and workbook data.

## Architecture

```text
Browser → TaskFlow AI Agent PWA (this app)
        → Agent API routes (server-side only)
        → Existing TaskFlow management backend APIs
        → Google Drive / Excel workbook (never touched directly by this app)
```

- The browser never receives management secrets, Google credentials or AI provider keys.
- Agent API routes forward the encrypted `taskflow_session` cookie to management APIs server-to-server.
- Management APIs remain authoritative: identity, role, permissions and ownership are re-checked there on every request.
- Admins use `ADMIN_EMAILS`; employees are matched to the `Employees` worksheet by email and must be `Active`.

## Screens

- **Home** — prompt entry, role-aware quick actions, feature cards, recent history.
- **Chat** — streaming-like assistant experience with structured task/performance/confirmation cards.
- **Recent History** — grouped by Today / Yesterday / Previous; rename/delete with confirmation.
- **Settings** — profile, backend status, sign-out.

## Requirements

- Node.js 20+
- Existing management app running (default `http://localhost:3000`)
- Optional for live AI answers: a Google AI Studio key (Gemini), used only server-side

## Gemini free-tier setup

1. Go to [Google AI Studio](https://aistudio.google.com/apikey) and create an API key.
2. Keep it local — put it in `.env.local`, never in committed files.
3. The default configuration uses Gemini's OpenAI-compatible endpoint and a free-tier flash-lite model with function-calling support:
   - `AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/`
   - `AI_MODEL=gemini-3.1-flash-lite`
4. Gemini free tier has per-minute and per-day rate limits; if you hit them, the agent surfaces a clear rate-limit error instead of fabricating results. Availability/quotas can change, so check AI Studio pricing/quota pages for your project.

## Setup

```powershell
cd "D:\Github Repos\taskflow_agent_app"
copy .env.example .env.local
# edit .env.local — at minimum set MANAGEMENT_APP_URL
npm install
npm run dev
```

Open `http://localhost:3000`? No — the management app usually uses 3000; run this app on its own port:

```powershell
npm run dev -- -p 3001
```

Then open `http://localhost:3001`.

### Minimal `.env.local`

```env
MANAGEMENT_APP_URL=http://localhost:3000
# Optional — without it the UI works but the agent replies with a clear "not configured" message.
# Get a free key at https://aistudio.google.com/apikey
AI_API_KEY=your-google-ai-studio-key
AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
AI_MODEL=gemini-3.1-flash-lite
```

## Auth flow

1. User enters work email on the PWA sign-in screen.
2. `POST /api/auth/signin` proxies to management `/api/auth/signin`.
3. Management returns `Set-Cookie: taskflow_session=...`; this app forwards it to the browser.
4. All protected pages/APIs call management `/api/me` to resolve the user.
5. Management enforces permissions and data scope; this app enforces UI availability and pre-checks tools.

## Conversation history

- Stored locally in `./data/conversations.json` (gitignored).
- Scoped by a one-way SHA-256 hash of the management user email.
- No management business data is duplicated.

> For multi-instance production deployments, replace the file store with a shared database and keep the same owner-hash scoping.

## PWA

- `public/manifest.json` — installable app metadata (name `TaskFlow AI`, short name `TaskFlow`).
- `public/sw.js` — caches only static assets/offline page; never caches API/auth/private data.
- `public/offline.html` — offline fallback screen.
- Service worker registers only in production (`npm run build && npm start`).

## Scripts

```powershell
npm run dev        # develop
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
npm run build      # production build
npm start          # serve production build
```

## Backend integration

See:

- `docs/EXISTING_BACKEND_ANALYSIS.md`
- `docs/AGENT_API_INTEGRATION.md`
- `docs/IMPLEMENTATION_NOTES.md`

## Security notes

- Do not commit `.env.local`.
- Do not expose `AI_API_KEY` to the browser.
- Unknown/inactive users are denied.
- Permission changes in the management app apply to the next agent request.
- This app never writes to the Excel workbook directly.

## Known limitations

- Email-only sign-in comes from the management app (development placeholder). Use behind HTTPS and corporate network controls, or add SSO there.
- Conversation store on local disk; use a database for multi-instance hosting.
- Voice input requires a browser with the Web Speech API (Chrome/Edge); falls back gracefully otherwise.
- External AI answers require `AI_API_KEY`; without it the app stays fully navigable but the agent returns a configuration error instead of fabricated answers.
- Gemini free tier is quota/rate-limited; heavy or concurrent use may hit limits. Use a paid tier or a different model if you need higher throughput.
