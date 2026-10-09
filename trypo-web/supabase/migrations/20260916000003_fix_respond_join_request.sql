-- Fix respond_to_join_request: its `returns table (trip_id uuid, status text)`
-- creates OUT parameters that shadow the columns trip_id / status, so the
-- `on conflict (trip_id, user_id)` target failed with ERROR 42702 (ambiguous
-- column reference) and accepting a request never worked. The function is
-- dropped and recreated with renamed OUT columns, and the result columns are
-- re-aliased so the client still receives trip_id / status.
drop function if exists public.respond_to_join_request(uuid, boolean);

create function public.respond_to_join_request(p_request_id uuid, p_accept boolean)
returns table (out_trip_id uuid, out_status text)
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
    values (v_trip.id, v_req.requester_id, 'viewer', 'accepted')
    on conflict (trip_id, user_id)
    do update set status = 'accepted', updated_at = now();
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

  return query select v_trip.id as trip_id, v_new_status as status;
end;
$$;

grant execute on function public.respond_to_join_request(uuid, boolean) to authenticated;