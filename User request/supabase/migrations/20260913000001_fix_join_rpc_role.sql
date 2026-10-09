-- Fix join_trip_by_code: the OUT parameter `role` shadowed the trip_members
-- column `role`, making `select role ...` ambiguous (the RPC always errored,
-- so invited accounts were never added as real members).
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

  select m.role into v_role
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