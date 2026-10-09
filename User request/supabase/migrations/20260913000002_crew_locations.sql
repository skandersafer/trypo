-- Live crew tracking ("Find My Crew").
-- Every trip member can publish their current position; other members see it
-- in near real-time through Supabase Realtime. Positions are keyed per
-- (trip, user, device) so one person logged in on several tabs does not fight.

-- ── Table ───────────────────────────────────────────────────────────────────
create table if not exists public.crew_locations (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_id text not null default 'default',
  lat numeric(9,6) not null,
  lng numeric(9,6) not null,
  heading numeric(5,2),
  accuracy numeric(8,2),
  location_name text,
  updated_at timestamptz not null default now(),
  unique (trip_id, user_id, device_id)
);

create index if not exists crew_locations_trip_updated_idx
  on public.crew_locations (trip_id, updated_at desc);

comment on table public.crew_locations is
  'Live GPS positions shared between the members of a trip (Find My Crew).';

-- ── Updated-at trigger ──────────────────────────────────────────────────────
drop trigger if exists crew_locations_set_updated_at on public.crew_locations;
create trigger crew_locations_set_updated_at
  before update on public.crew_locations
  for each row execute function private.set_updated_at();

-- Keep the table tidy: drop positions nobody refreshed during the last hours.
create or replace function private.prune_stale_crew_locations()
returns trigger
language plpgsql security definer set search_path = public, auth as $$
begin
  delete from public.crew_locations
  where trip_id = new.trip_id
    and updated_at < now() - interval '4 hours';
  return new;
end;
$$;

drop trigger if exists crew_locations_prune_stale on public.crew_locations;
create trigger crew_locations_prune_stale
  after insert or update on public.crew_locations
  for each row execute function private.prune_stale_crew_locations();

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.crew_locations enable row level security;

drop policy if exists crew_locations_select on public.crew_locations;
drop policy if exists crew_locations_insert on public.crew_locations;
drop policy if exists crew_locations_update on public.crew_locations;
drop policy if exists crew_locations_delete on public.crew_locations;

-- Any trip member can read the crew's shared positions.
create policy crew_locations_select on public.crew_locations
  for select to authenticated
  using ((select private.is_trip_member(trip_id)));

-- A member can only insert/update their own rows (upserts use the update path
-- to refresh an existing row, which requires being a trip member too).
create policy crew_locations_insert on public.crew_locations
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.is_trip_member(trip_id)));

create policy crew_locations_update on public.crew_locations
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (select private.is_trip_member(trip_id)));

create policy crew_locations_delete on public.crew_locations
  for delete to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.crew_locations to authenticated;

-- ── Realtime ────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'crew_locations'
  ) then
    alter publication supabase_realtime add table public.crew_locations;
  end if;
end;
$$;