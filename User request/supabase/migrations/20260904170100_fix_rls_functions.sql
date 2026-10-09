-- Fix RLS policies and RPC functions for Trypo application

-- 1. Ensure functions run with search_path set and proper SECURITY DEFINER where needed
create or replace function private.is_trip_member(p_trip_id uuid)
returns boolean language sql security definer stable set search_path = public, auth as $$
  select exists (
    select 1 from public.trip_members m
    where m.trip_id = p_trip_id
      and m.user_id = auth.uid()
      and m.status = 'accepted'
  );
$$;

create or replace function private.can_edit_trip(p_trip_id uuid)
returns boolean language sql security definer stable set search_path = public, auth as $$
  select exists (
    select 1 from public.trip_members m
    where m.trip_id = p_trip_id
      and m.user_id = auth.uid()
      and m.status = 'accepted'
      and m.role in ('owner', 'editor')
  );
$$;

create or replace function private.can_manage_trip(p_trip_id uuid)
returns boolean language sql security definer stable set search_path = public, auth as $$
  select exists (
    select 1 from public.trip_members m
    where m.trip_id = p_trip_id
      and m.user_id = auth.uid()
      and m.status = 'accepted'
      and m.role = 'owner'
  );
$$;

-- 2. Upgrade create_trip_with_destinations to SECURITY DEFINER to atomically bypass RLS issues during trip & destination creation
create or replace function public.create_trip_with_destinations(
  p_title text,
  p_destinations jsonb,
  p_travel_style text default null,
  p_companion_type text default null,
  p_start_date date default null,
  p_end_date date default null
)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare
  v_trip_id uuid;
  v_user_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication is required';
  end if;

  -- Ensure profile exists
  insert into public.profiles (id, full_name)
  values (v_user_id, '')
  on conflict (id) do nothing;

  -- Insert trip
  insert into public.trips (owner_id, title, travel_style, companion_type, start_date, end_date)
  values (v_user_id, p_title, p_travel_style, p_companion_type, p_start_date, p_end_date)
  returning id into v_trip_id;

  -- Insert destinations if provided
  if p_destinations is not null and jsonb_array_length(p_destinations) > 0 then
    insert into public.trip_destinations (trip_id, city, country, position)
    select v_trip_id, value, 'Unknown', ordinality - 1
    from jsonb_array_elements_text(p_destinations) with ordinality;
  end if;

  return v_trip_id;
end;
$$;

-- 3. Re-grant permissions
grant execute on function public.create_trip_with_destinations(text, jsonb, text, text, date, date) to authenticated;

-- 4. Update RLS policies on trips and destinations for direct table operations
drop policy if exists trips_read on public.trips;
drop policy if exists trips_insert on public.trips;
drop policy if exists trips_update on public.trips;
drop policy if exists trips_delete on public.trips;

create policy trips_read on public.trips for select to authenticated
  using (owner_id = auth.uid() or visibility = 'public' or (select private.is_trip_member(id)));

create policy trips_insert on public.trips for insert to authenticated
  with check (owner_id = auth.uid());

create policy trips_update on public.trips for update to authenticated
  using (owner_id = auth.uid() or (select private.can_manage_trip(id)))
  with check (owner_id = auth.uid() or (select private.can_manage_trip(id)));

create policy trips_delete on public.trips for delete to authenticated
  using (owner_id = auth.uid() or (select private.can_manage_trip(id)));

-- Destination RLS policies fix
drop policy if exists trip_destinations_read on public.trip_destinations;
drop policy if exists trip_destinations_insert on public.trip_destinations;
drop policy if exists trip_destinations_update on public.trip_destinations;
drop policy if exists trip_destinations_delete on public.trip_destinations;

create policy trip_destinations_read on public.trip_destinations for select to authenticated
  using (exists (select 1 from public.trips t where t.id = trip_id and (t.owner_id = auth.uid() or (select private.is_trip_member(t.id)))));

create policy trip_destinations_insert on public.trip_destinations for insert to authenticated
  with check (exists (select 1 from public.trips t where t.id = trip_id and (t.owner_id = auth.uid() or (select private.can_edit_trip(t.id)))));

create policy trip_destinations_update on public.trip_destinations for update to authenticated
  using (exists (select 1 from public.trips t where t.id = trip_id and (t.owner_id = auth.uid() or (select private.can_edit_trip(t.id)))))
  with check (exists (select 1 from public.trips t where t.id = trip_id and (t.owner_id = auth.uid() or (select private.can_edit_trip(t.id)))));

create policy trip_destinations_delete on public.trip_destinations for delete to authenticated
  using (exists (select 1 from public.trips t where t.id = trip_id and (t.owner_id = auth.uid() or (select private.can_edit_trip(t.id)))));

