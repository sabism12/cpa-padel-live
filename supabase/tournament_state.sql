-- CPA Padel persistent application state.
-- Run this once in Supabase Dashboard -> SQL Editor -> New query.

create table if not exists public.tournament_state (
  id text primary key default 'singleton' check (id = 'singleton'),
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  updated_at timestamptz not null default now()
);

-- No public/anon/authenticated policies are created. The web server uses only
-- the private service-role key, and public clients must never write this table.
alter table public.tournament_state enable row level security;
revoke all on table public.tournament_state from anon, authenticated;
grant select, insert, update on table public.tournament_state to service_role;

-- Initialize only when the singleton is absent. On conflict, return the
-- existing saved state instead of overwriting it with seed data.
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

-- Store a complete state snapshot as one atomic Postgres row update.
create or replace function public.save_tournament_state(next_state jsonb)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  update public.tournament_state
  set state = next_state,
      updated_at = now()
  where id = 'singleton';

  if not found then
    raise exception 'tournament_state singleton row has not been initialized';
  end if;

  return true;
end;
$function$;

-- The functions are server-only. Do not allow public/anonymous callers.
revoke all on function public.initialize_tournament_state(jsonb) from public, anon, authenticated;
revoke all on function public.save_tournament_state(jsonb) from public, anon, authenticated;
grant execute on function public.initialize_tournament_state(jsonb) to service_role;
grant execute on function public.save_tournament_state(jsonb) to service_role;
