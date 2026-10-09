-- Fix request_to_join_trip: the OUT parameter `status` of `returns table`
-- shadows column references inside the function, so the join-request INSERT
-- failed with ERROR 42702 "column reference status is ambiguous" and no
-- request (or notification) was ever created. Qualify the columns.
create or replace function public.request_to_join_trip(p_trip_id uuid, p_message text default null)
returns table (request_id uuid, status text, already_in_trip boolean)
language plpgsql security definer set search_path = public, auth as $$
declare
  v_uid uuid := auth.uid();
  v_trip public.trips%rowtype;
  v_new_id uuid;
  v_new_status text;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if p_message is not null and char_length(p_message) > 2000 then
    raise exception 'Message too long';
  end if;

  select * into v_trip from public.trips where id = p_trip_id and visibility = 'public';
  if not found then
    raise exception 'Trip is not shared to the community';
  end if;

  if v_trip.owner_id = v_uid then
    return query select null::uuid, 'accepted', true;
    return;
  end if;

  insert into public.profiles (id, full_name)
  values (v_uid, '')
  on conflict (id) do nothing;

  if exists (
    select 1 from public.trip_members m
    where m.trip_id = p_trip_id and m.user_id = v_uid and m.status = 'accepted'
  ) then
    return query select null::uuid, 'accepted', true;
    return;
  end if;

  insert into public.join_requests (trip_id, requester_id, message, status)
  values (p_trip_id, v_uid, p_message, 'pending')
  on conflict (trip_id, requester_id)
  do update set
    message = excluded.message,
    -- Re-requests after a decline become pending again; an accepted request
    -- is never downgraded.
    status = case when public.join_requests.status = 'declined' then 'pending' else public.join_requests.status end,
    updated_at = now()
  returning public.join_requests.id, public.join_requests.status
  into v_new_id, v_new_status;

  if v_new_status = 'pending' then
    insert into public.notifications (user_id, type, title, body, data)
    values (
      v_trip.owner_id,
      'join_request',
      'New join request 🙋',
      (select coalesce(p.full_name, 'A traveler') from public.profiles p where p.id = v_uid)
        || ' wants to join "' || v_trip.title || '"',
      jsonb_build_object('trip_id', v_trip.id, 'request_id', v_new_id)
    );
  end if;

  return query select v_new_id, v_new_status, false;
end;
$$;

grant execute on function public.request_to_join_trip(uuid, text) to authenticated;