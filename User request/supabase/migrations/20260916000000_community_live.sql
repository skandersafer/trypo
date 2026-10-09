-- Trypo community live features.
-- 1) Realtime for the community feed: comments, join requests, reactions.
-- 2) Public trips share their destinations + itinerary with the community.
-- 3) RPCs: request to join, respond to a request, share/unshare a trip,
--    toggle a reaction, and a feed endpoint with live counters.

-- ── 1) Realtime publications ───────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['trip_comments','join_requests','trip_reactions']
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

-- ── 2) Public read for shared trips ────────────────────────────────────────
-- Making a trip public opens its destinations and itinerary to authenticated
-- community members. Bookings, expenses and packing stay private (RLS still
-- requires an accepted member row for those).
drop policy if exists trip_destinations_public_read on public.trip_destinations;
create policy trip_destinations_public_read on public.trip_destinations
  for select to authenticated
  using (exists (
    select 1 from public.trips t
    where t.id = trip_id and t.visibility = 'public'
  ));

drop policy if exists itinerary_public_read on public.itinerary_items;
create policy itinerary_public_read on public.itinerary_items
  for select to authenticated
  using (exists (
    select 1 from public.trips t
    where t.id = trip_id and t.visibility = 'public'
  ));

-- ── 3) Join request flow ───────────────────────────────────────────────────
-- Anyone can ask to join a shared trip. The owner is notified and can accept
-- (adds the requester as an accepted trip member) or decline. The requester is
-- notified of the decision and sees the status in realtime.
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

  with ins as (
    insert into public.join_requests (trip_id, requester_id, message, status)
    values (p_trip_id, v_uid, p_message, 'pending')
    on conflict (trip_id, requester_id)
    do update set
      message = excluded.message,
      -- Re-requests after a decline become pending again; an accepted request
      -- is never downgraded.
      status = case when public.join_requests.status = 'declined' then 'pending' else public.join_requests.status end,
      updated_at = now()
    returning id, status
  )
  select id, status into v_new_id, v_new_status from ins limit 1;

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

  return query select v_trip.id, v_new_status;
end;
$$;

-- ── 4) Share / unshare a trip to the community (owner only) ────────────────
create or replace function public.set_trip_visibility(p_trip_id uuid, p_public boolean)
returns void
language plpgsql security definer set search_path = public, auth as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  update public.trips t
  set visibility = case when p_public then 'public' else 'private' end,
      updated_at = now()
  where t.id = p_trip_id and t.owner_id = v_uid;

  if not found then
    raise exception 'TRIP_NOT_FOUND_OR_NOT_OWNER';
  end if;
end;
$$;

-- ── 5) Reactions (epic/save counter) ───────────────────────────────────────
create or replace function public.toggle_trip_reaction(p_trip_id uuid)
returns table (active boolean, total bigint)
language plpgsql security definer set search_path = public, auth as $$
declare
  v_uid uuid := auth.uid();
  v_exists public.trip_reactions%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if not exists (select 1 from public.trips where id = p_trip_id) then
    raise exception 'TRIP_NOT_FOUND';
  end if;

  select * into v_exists from public.trip_reactions
  where trip_id = p_trip_id and user_id = v_uid;

  if v_exists.trip_id is not null then
    delete from public.trip_reactions where trip_id = p_trip_id and user_id = v_uid;
  else
    insert into public.trip_reactions (trip_id, user_id) values (p_trip_id, v_uid);
  end if;

  return query select
    exists (select 1 from public.trip_reactions where trip_id = p_trip_id and user_id = v_uid),
    (select count(*)::bigint from public.trip_reactions where trip_id = p_trip_id);
end;
$$;

-- ── 6) Community feed with live counters ───────────────────────────────────
-- Only public trips are ever returned; the accepted-member count excludes the
-- owner, and the comment count drives the feed bubbles.
create or replace function public.get_community_feed()
returns table (
  id uuid,
  title text,
  summary text,
  cover_image_url text,
  start_date date,
  end_date date,
  travel_style text,
  created_at timestamptz,
  owner_id uuid,
  author_name text,
  author_avatar text,
  joiners_count bigint,
  comments_count bigint,
  reactions_count bigint
)
language plpgsql security definer set search_path = public, auth as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  return query
    select
      t.id,
      t.title,
      t.summary,
      t.cover_image_url,
      t.start_date,
      t.end_date,
      t.travel_style,
      t.created_at,
      t.owner_id,
      coalesce(p.full_name, 'Traveler')::text as author_name,
      p.avatar_url::text as author_avatar,
      (select count(*) from public.trip_members m
        where m.trip_id = t.id and m.status = 'accepted' and m.role <> 'owner')::bigint as joiners_count,
      (select count(*) from public.trip_comments c
        where c.trip_id = t.id)::bigint as comments_count,
      (select count(*) from public.trip_reactions r
        where r.trip_id = t.id)::bigint as reactions_count
    from public.trips t
    left join public.profiles p on p.id = t.owner_id
    where t.visibility = 'public'
    order by t.created_at desc
    limit 50;
end;
$$;

-- ── 7) Exec grants (never expose these to anon/public) ─────────────────────
revoke all on function public.request_to_join_trip(uuid, text) from public, anon;
revoke all on function public.respond_to_join_request(uuid, boolean) from public, anon;
revoke all on function public.set_trip_visibility(uuid, boolean) from public, anon;
revoke all on function public.toggle_trip_reaction(uuid) from public, anon;
revoke all on function public.get_community_feed() from public, anon;

grant execute on function public.request_to_join_trip(uuid, text) to authenticated;
grant execute on function public.respond_to_join_request(uuid, boolean) to authenticated;
grant execute on function public.set_trip_visibility(uuid, boolean) to authenticated;
grant execute on function public.toggle_trip_reaction(uuid) to authenticated;
grant execute on function public.get_community_feed() to authenticated;