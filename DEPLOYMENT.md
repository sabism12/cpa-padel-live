# Free deployment: Render + Supabase

This deployment uses a **free Render Web Service** and **Supabase Free Postgres**. There is no Render disk, Render Postgres, background worker, or second app. The Node/Express server remains the only API and SSE server; Supabase stores the existing tournament-state JSON as one JSONB row.

## 1. Create the free Supabase project

1. Go to [supabase.com](https://supabase.com), create/sign in to a free account, then choose **New project**.
2. Select the free organization/plan. Name the project, choose a strong database password, and select a nearby region. Save the database password privately; this app uses the API key, not the database password.
3. Wait for Supabase to finish creating the project.
4. In the Supabase dashboard, open **SQL Editor** → **New query**.
5. Open this repository's `supabase/tournament_state.sql`, copy the entire file into the SQL Editor, then click **Run**. It creates the singleton JSONB table and two server-only functions. It does not add public read/write policies.
6. Confirm `tournament_state` appears under **Table Editor**. Leave Row Level Security enabled and do not add public policies.

### Exact SQL (also saved in `supabase/tournament_state.sql`)

```sql
create table if not exists public.tournament_state (
  id text primary key default 'singleton' check (id = 'singleton'),
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  updated_at timestamptz not null default now()
);

alter table public.tournament_state enable row level security;
revoke all on table public.tournament_state from anon, authenticated;
grant select, insert, update on table public.tournament_state to service_role;

create or replace function public.initialize_tournament_state(initial_state jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  saved_state jsonb;
begin
  insert into public.tournament_state (id, state)
  values ('singleton', initial_state)
  on conflict (id) do nothing;
  select ts.state into saved_state
  from public.tournament_state as ts
  where ts.id = 'singleton';
  return saved_state;
end;
$function$;

create or replace function public.save_tournament_state(next_state jsonb)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  update public.tournament_state
  set state = next_state, updated_at = now()
  where id = 'singleton';
  if not found then
    raise exception 'tournament_state singleton row has not been initialized';
  end if;
  return true;
end;
$function$;

revoke all on function public.initialize_tournament_state(jsonb) from public, anon, authenticated;
revoke all on function public.save_tournament_state(jsonb) from public, anon, authenticated;
grant execute on function public.initialize_tournament_state(jsonb) to service_role;
grant execute on function public.save_tournament_state(jsonb) to service_role;
```

The initializer is insert-if-absent: it returns a saved row if one exists and never replaces it with seed data. Only the server's service-role client calls these functions. The browser has no Supabase client or service key.

## 2. Get the Supabase values

In Supabase, open **Project Settings** → **API Keys** (or **API** → **Project API keys**, depending on the dashboard layout):

- Copy the **Project URL**. This is `SUPABASE_URL`.
- Reveal/copy the **service_role** secret key. This is `SUPABASE_SERVICE_ROLE_KEY`.

The service-role key bypasses RLS. Treat it like a password: enter it only in Render's server environment settings. Never put it in React code, a `VITE_` variable, GitHub, or a public API response.

## 3. Create a private GitHub repository

1. Create a **Private** repository on GitHub.
2. Push this copied project, not the original. Check `git remote -v`; set this copy's `origin` to the new private repository before pushing.
3. The repository ignores `.env`, local JSON state, `node_modules`, and build output. No secrets should be committed.

## 4. Create the free Render Web Service

This repository includes `render.yaml`. In Render:

1. Select **New** → **Blueprint**, connect the private GitHub repository, and choose the `main` branch.
2. Review the Blueprint. It specifies a **Free** web service, **one instance**, build command `npm ci && npm run build`, start command `npm start`, and health check `/health`. It creates no disk or Render database.
3. When prompted for unsynced environment values, enter the four secrets/values below. If the Blueprint does not prompt for them, create them under the service's **Environment** tab before the first successful deploy.
4. Click **Apply** / **Deploy** and wait for Render's build and health check.

Required Render environment variables:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` (set by the Blueprint) |
| `NODE_VERSION` | `22.23.3` (also pinned in `.node-version`) |
| `TOURNAMENT_STORAGE` | `supabase` (set by the Blueprint) |
| `SESSION_SECRET` | At least 32 private random characters (Render generates one) |
| `SUPABASE_URL` | Project URL copied from Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Private service-role key copied from Supabase |
| `INITIAL_ADMIN_PASSWORD` | Private admin password for the first state seed |
| `INITIAL_SCOREKEEPER_PIN` | Private scorekeeper PIN for the first state seed |

Render provides `PORT`; the app reads it and binds to `0.0.0.0`. Do not set a fixed port. `INITIAL_ADMIN_PASSWORD` and `INITIAL_SCOREKEEPER_PIN` are used only when the Supabase table is empty. If the row already exists, the saved credentials and tournament data are loaded unchanged. Redeployment does not reset them.

Optional: `CORS_ORIGINS` is a comma-separated allowlist for approved cross-origin tools. The website itself is same-origin and needs no CORS setting. Leave it unset unless required.

## 5. Local development and storage modes

- `npm run dev` uses the existing local `data/tournament_state.json` by default.
- `TOURNAMENT_STORAGE=file` explicitly selects local JSON storage.
- `TOURNAMENT_STORAGE=supabase` selects Supabase, requiring `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
- Production defaults to Supabase storage. Production refuses to initialize a new state without `INITIAL_ADMIN_PASSWORD` and `INITIAL_SCOREKEEPER_PIN`.
- `npm start` runs the compiled production server and sets `NODE_ENV=production`.

Local `.env` files are not automatically loaded by this project; set variables in your terminal or use your development environment's secret manager. Keep `.env` private and untracked.

## 6. State, concurrency, and realtime

The existing tournament JSON shape is stored in `tournament_state.state` (JSONB). Startup loads the saved singleton before accepting requests. A new table gets the existing roster and initial tournament state. Existing rows are never seeded over. Mutations are serialized in the one Node instance, writes are queued, and API success responses wait for persistence. The group draw remains server-authoritative and keeps its 20-pair / 5-group / 4-per-group rules.

The public viewer connects to the existing SSE route. Supabase persistence completes before an update is broadcast. EventSource reconnects and refetches the complete snapshot; polling is a fallback. While the draw page is open, it makes a quiet `GET /api/draw` every 5 minutes because Render Free may sleep after 15 minutes without inbound requests (SSE server heartbeats alone do not prevent that).

Keep `numInstances: 1`. Do not enable autoscaling, multiple instances, or worker processes; in-memory state and SSE subscribers are per process. The design supports the requested ~100 spectators on one service instance.

### Free-tier availability limits

The Blueprint selects only Render Free and Supabase Free resources and has no
disk or paid database. Free hosting is not an uptime-guaranteed production
service: Render can sleep an idle service, restart it, enforce monthly usage
limits, or take it offline when a limit is reached. The first request after
sleep may wait for a cold start. Supabase Free may pause a project after a week
of inactivity; check the Supabase dashboard and resume the project before the
tournament if needed. The spectator page's 5-minute HTTP keepalive prevents an
open draw page from being idle at Render, but does not replace provider
availability guarantees. Provider signup/billing checks can change; verify the
current account flow yourself if a no-card signup is essential.

## 7. Test after deployment

1. Check `https://YOUR-RENDER-SERVICE.onrender.com/health` returns `{"status":"ok"}`.
2. Open `/` and confirm existing CPA Padel pages load.
3. Open `/draw` on a spectator device/browser; no login should be requested.
4. Open `/draw/admin` and log in with the initial admin password.
5. Initialize a test draw, press SPIN, and confirm spectators update without refreshing.
6. Refresh `/draw`, or open it in a new browser, and check current state is recovered.
7. Test Undo and Reset, then—if appropriate—complete all 20 test draws and check four pairs per group.
8. Do not run destructive tests against the live tournament; use a separate Supabase project/table for rehearsals.

## Troubleshooting

- **Render service fails to start:** Check Render logs and confirm `SESSION_SECRET`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` are configured. A fresh database also needs both `INITIAL_*` credentials.
- **Supabase logs show `TypeError: fetch failed`:** Check the redacted cause entries in Render logs (for example, the error code/name/message) and the logged Supabase hostname. The installed `@supabase/supabase-js` declares Node `>=22`; Node 26 meets that range, so this message alone does not prove a Node-version incompatibility. This project pins Node `22.23.3` to use the stable Node 22 LTS runtime. Confirm Render's `NODE_VERSION` is not still overridden to 26.10.0, then check DNS/network reachability to the Supabase hostname and the service URL configuration. The service-role key is never logged.
- **Supabase table/RPC error:** Run the complete `supabase/tournament_state.sql` in SQL Editor. Confirm the table and both functions exist and RLS is enabled.
- **Admin login fails:** Existing Supabase state keeps its saved password. Changing `INITIAL_ADMIN_PASSWORD` after initialization does not change that saved password; update it through `/admin` → **Rules & Scoring**.
- **Draw state missing after restart:** Confirm `TOURNAMENT_STORAGE=supabase`, and that the service uses the same Supabase project URL and service-role key. Inspect the singleton row in Table Editor.
- **SSE update delayed:** Confirm `/api/live-events` is reachable on the same service URL. EventSource reconnects; viewer snapshots/polling recover state.
- **Render sleeps:** An open `/draw` page requests `/api/draw` every five minutes. The first inbound request after sleep may take time while Render wakes.
- **Cross-origin browser integration fails:** Add the exact allowed origin to `CORS_ORIGINS`; never use a wildcard.

## Commands

```bash
npm install
npm ci
npx tsc --noEmit
npm run build
npm start
```
