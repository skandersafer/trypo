-- Notify the organizer when a new member joins via their invite code.
-- join_trip_by_code auto-accepts silently, so a join that arrives through the
-- share-code path never reached the organizer's notifications before. Keep the
-- existing return shape (client unchanged) and qualify every column reference
-- that could collide with the `returns table` OUT parameters.
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

  v_role := 'editor';
  insert into public.trip_members (trip_id, user_id, role, status)
  values (v_trip.id, v_uid, v_role, 'accepted');

  insert into public.notifications (user_id, type, title, body, data)
  values (
    v_trip.owner_id,
    'join_accepted',
    'New crew member 🎉',
    (select coalesce(p.full_name, 'A traveler') from public.profiles p where p.id = v_uid)
      || ' joined "' || v_trip.title || '"',
    jsonb_build_object('trip_id', v_trip.id, 'user_id', v_uid)
  );

  return query select v_trip.id, v_trip.title, v_role, false;
end;
$$;

revoke all on function public.join_trip_by_code(text) from public, anon;
grant execute on function public.join_trip_by_code(text) to authenticated;