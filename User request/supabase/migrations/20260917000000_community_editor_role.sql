-- Community joiners share trip content (destinations, itinerary/transport,
-- bookings, ...). Accepted members were granted role 'viewer', but every
-- item-write RLS policy requires private.can_edit_trip() (owner/editor), so a
-- joiner's additions were rejected by the server and never reached the other
-- account. Grant 'editor' instead (same as the invite-code flow
-- join_trip_by_code) and upgrade members that are already accepted viewers.
create or replace function public.respond_to_join_request(p_request_id uuid, p_accept boolean)
returns table (trip_id uuid, status text)
language plpgsql security definer set search_path = public, auth as $$
declare
  v_uid uuid := auth.uid();
  v_req public.join_requests%rowtype;
  v_trip public.trips%rowtype;
  v_new_status text;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select * into v_req from public.join_requests where id = p_request_id;
  if not found then
    raise exception 'JOIN_REQUEST_NOT_FOUND';
  end if;

  select * into v_trip from public.trips where id = v_req.trip_id;
  if not found then
    raise exception 'TRIP_NOT_FOUND';
  end if;

  if v_trip.owner_id <> v_uid then
    raise exception 'Only the trip owner can respond to join requests';
  end if;

  insert into public.profiles (id, full_name)
  values (v_req.requester_id, '')
  on conflict (id) do nothing;

  if p_accept then
    insert into public.trip_members (trip_id, user_id, role, status)
    values (v_trip.id, v_req.requester_id, 'editor', 'accepted')
    on conflict (trip_id, user_id)
    do update set role = 'editor', status = 'accepted', updated_at = now();
  end if;

  v_new_status := case when p_accept then 'accepted' else 'declined' end;

  update public.join_requests
  set status = v_new_status, updated_at = now()
  where id = p_request_id;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    v_req.requester_id,
    case when p_accept then 'join_accepted' else 'join_declined' end,
    case when p_accept
      then 'You are in "' || v_trip.title || '" 🎉'
      else 'Join request declined'
    end,
    case when p_accept
      then 'The owner accepted your request. You are now part of the trip crew.'
      else 'The owner declined your request to join "' || v_trip.title || '".'
    end,
    jsonb_build_object('trip_id', v_trip.id, 'request_id', p_request_id)
  );

  return query select v_trip.id, v_new_status;
end;
$$;

-- One-time upgrade: 'viewer' was only ever granted by the previous version of
-- this function, so every accepted viewer is a community joiner that must be
-- able to share content.
update public.trip_members
set role = 'editor', updated_at = now()
where role = 'viewer' and status = 'accepted';
