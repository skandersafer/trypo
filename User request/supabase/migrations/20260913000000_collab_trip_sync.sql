-- Server-authoritative collaborative trips.
-- 1) join_trip_by_code RPC: invite-code users become real, RLS-visible members.
-- 2) members_leave policy: a member (non-owner) can remove themselves.
-- 3) Enable Supabase realtime on the collaborative tables for live cross-account sync.

-- ── 1) Join by invite code ────────────────────────────────────────────────
create or replace function public.join_trip_by_code(p_code text)
returns table (trip_id uuid, title text, role text, already_member boolean)
language plpgsql security definer set search_path = public, auth as $$
declare
  v_uid uuid := auth.uid();
  v_trip public.trips%rowtype;
  v_role text;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select * into v_trip
  from public.trips t
  where upper(coalesce(t.invite_code, '')) = upper(trim(p_code))
     or t.id::text = trim(p_code)
  limit 1;

  if not found then
    raise exception 'TRIP_NOT_FOUND';
  end if;

  select role into v_role
  from public.trip_members m
  where m.trip_id = v_trip.id and m.user_id = v_uid;

  if v_role is not null then
    return query select v_trip.id, v_trip.title, v_role, true;
    return;
  end if;

  insert into public.profiles (id, full_name)
  values (v_uid, '')
  on conflict (id) do nothing;

  insert into public.trip_members (trip_id, user_id, role, status)
  values (v_trip.id, v_uid, 'editor', 'accepted');

  return query select v_trip.id, v_trip.title, 'editor', false;
end;
$$;

revoke all on function public.join_trip_by_code(text) from public, anon;
grant execute on function public.join_trip_by_code(text) to authenticated;

-- ── 2) Members can leave (self-removal, except the owner) ─────────────────
drop policy if exists members_leave on public.trip_members;
create policy members_leave on public.trip_members
  for delete to authenticated
  using (user_id = auth.uid() and role <> 'owner');

-- ── 3) Realtime publications for live collaboration ───────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['trips','trip_members','trip_destinations','itinerary_items','bookings','expenses','packing_items']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I;', t);
    end if;
  end loop;
end;
$$;