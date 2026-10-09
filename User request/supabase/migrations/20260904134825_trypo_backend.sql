create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique check (username is null or username ~ '^[a-z0-9_]{3,30}$'),
  full_name text not null default '',
  avatar_url text,
  bio text not null default '',
  home_country text,
  travel_styles text[] not null default '{}',
  default_companion_type text check (default_companion_type in ('solo', 'couple', 'friends', 'family')),
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.destinations (
  id uuid primary key default gen_random_uuid(),
  city text not null,
  country text not null,
  country_code text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  cover_image_url text,
  description text,
  tags text[] not null default '{}',
  average_daily_budget numeric(12,2) check (average_daily_budget >= 0),
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (city, country)
);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid references public.destinations(id) on delete set null,
  title text not null,
  category text not null check (category in ('activity', 'food', 'place', 'stay', 'transport', 'other')),
  description text,
  location_name text,
  cover_image_url text,
  estimated_cost numeric(12,2) check (estimated_cost >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  duration_minutes integer check (duration_minutes > 0),
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  summary text,
  cover_image_url text,
  start_date date,
  end_date date,
  total_budget numeric(12,2) check (total_budget >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  travel_style text,
  companion_type text check (companion_type in ('solo', 'couple', 'friends', 'family')),
  status text not null default 'planning' check (status in ('planning', 'upcoming', 'active', 'past', 'archived')),
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  planning_progress smallint not null default 0 check (planning_progress between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create table public.trip_members (
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'viewer' check (role in ('owner', 'editor', 'viewer')),
  status text not null default 'accepted' check (status in ('invited', 'accepted', 'declined')),
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

create table public.trip_destinations (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  destination_id uuid references public.destinations(id) on delete set null,
  position integer not null check (position >= 0),
  city text not null,
  country text not null,
  arrival_date date,
  departure_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trip_id, position),
  check (departure_date is null or arrival_date is null or departure_date >= arrival_date)
);

create table public.itinerary_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  trip_destination_id uuid references public.trip_destinations(id) on delete set null,
  activity_id uuid references public.activities(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  item_type text not null check (item_type in ('flight', 'stay', 'transport', 'activity', 'food', 'place', 'note')),
  title text not null,
  details text,
  location_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  all_day boolean not null default false,
  position integer not null default 0 check (position >= 0),
  estimated_cost numeric(12,2) check (estimated_cost >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  itinerary_item_id uuid references public.itinerary_items(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  booking_type text not null check (booking_type in ('flight', 'stay', 'transport', 'activity')),
  provider text,
  confirmation_code text,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'booked', 'cancelled')),
  starts_at timestamptz,
  ends_at timestamptz,
  amount numeric(12,2) check (amount >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  attachment_path text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  paid_by uuid not null references public.profiles(id) on delete restrict,
  category text not null check (category in ('accommodation', 'transportation', 'food', 'activities', 'shopping', 'other')),
  description text not null,
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  expense_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.saved_trips (
  user_id uuid not null references public.profiles(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, trip_id)
);

create table public.saved_places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  destination_id uuid references public.destinations(id) on delete set null,
  activity_id uuid references public.activities(id) on delete set null,
  title text not null,
  category text not null check (category in ('stay', 'activity', 'food', 'place')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.packing_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  category text not null default 'other',
  label text not null,
  quantity integer not null default 1 check (quantity > 0),
  is_packed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.trip_memories (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  trip_destination_id uuid references public.trip_destinations(id) on delete set null,
  storage_path text not null,
  caption text,
  taken_at timestamptz,
  latitude numeric(9,6),
  longitude numeric(9,6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.trip_comments (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  comment_type text not null default 'comment' check (comment_type in ('comment', 'advice', 'opinion', 'question', 'join_interest')),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.trip_reactions (
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

create table public.join_requests (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  message text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trip_id, requester_id)
);

create table public.activity_votes (
  itinerary_item_id uuid not null references public.itinerary_items(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (itinerary_item_id, user_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.visited_countries (
  user_id uuid not null references public.profiles(id) on delete cascade,
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  first_visited_on date,
  created_at timestamptz not null default now(),
  primary key (user_id, country_code)
);

create index trips_owner_id_idx on public.trips(owner_id);
create index trips_public_created_at_idx on public.trips(created_at desc) where visibility = 'public';
create index trip_members_user_id_idx on public.trip_members(user_id);
create index trip_destinations_trip_position_idx on public.trip_destinations(trip_id, position);
create index itinerary_items_trip_starts_at_idx on public.itinerary_items(trip_id, starts_at, position);
create index bookings_trip_starts_at_idx on public.bookings(trip_id, starts_at);
create index expenses_trip_expense_date_idx on public.expenses(trip_id, expense_date desc);
create index saved_places_user_id_idx on public.saved_places(user_id);
create index packing_items_trip_id_idx on public.packing_items(trip_id);
create index trip_memories_trip_id_idx on public.trip_memories(trip_id);
create index trip_comments_trip_created_at_idx on public.trip_comments(trip_id, created_at);
create index join_requests_trip_id_idx on public.join_requests(trip_id);
create index notifications_user_created_at_idx on public.notifications(user_id, created_at desc);

create or replace function private.set_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.create_profile_for_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create or replace function private.add_owner_as_member()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.trip_members (trip_id, user_id, role, status)
  values (new.id, new.owner_id, 'owner', 'accepted');
  return new;
end;
$$;

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

  insert into public.trips (owner_id, title, travel_style, companion_type, start_date, end_date)
  values (v_user_id, p_title, p_travel_style, p_companion_type, p_start_date, p_end_date)
  returning id into v_trip_id;

  if p_destinations is not null and jsonb_array_length(p_destinations) > 0 then
    insert into public.trip_destinations (trip_id, city, country, position)
    select v_trip_id, value, 'Unknown', ordinality - 1
    from jsonb_array_elements_text(p_destinations) with ordinality;
  end if;

  return v_trip_id;
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_trip_member(uuid), private.can_edit_trip(uuid), private.can_manage_trip(uuid) to authenticated;
grant execute on function public.create_trip_with_destinations(text, jsonb, text, text, date, date) to authenticated;

create trigger profiles_set_updated_at before update on public.profiles for each row execute function private.set_updated_at();
create trigger destinations_set_updated_at before update on public.destinations for each row execute function private.set_updated_at();
create trigger activities_set_updated_at before update on public.activities for each row execute function private.set_updated_at();
create trigger trips_set_updated_at before update on public.trips for each row execute function private.set_updated_at();
create trigger trip_members_set_updated_at before update on public.trip_members for each row execute function private.set_updated_at();
create trigger trip_destinations_set_updated_at before update on public.trip_destinations for each row execute function private.set_updated_at();
create trigger itinerary_items_set_updated_at before update on public.itinerary_items for each row execute function private.set_updated_at();
create trigger bookings_set_updated_at before update on public.bookings for each row execute function private.set_updated_at();
create trigger expenses_set_updated_at before update on public.expenses for each row execute function private.set_updated_at();
create trigger saved_places_set_updated_at before update on public.saved_places for each row execute function private.set_updated_at();
create trigger packing_items_set_updated_at before update on public.packing_items for each row execute function private.set_updated_at();
create trigger trip_memories_set_updated_at before update on public.trip_memories for each row execute function private.set_updated_at();
create trigger trip_comments_set_updated_at before update on public.trip_comments for each row execute function private.set_updated_at();
create trigger join_requests_set_updated_at before update on public.join_requests for each row execute function private.set_updated_at();
create trigger on_auth_user_created after insert on auth.users for each row execute function private.create_profile_for_user();
create trigger on_trip_created after insert on public.trips for each row execute function private.add_owner_as_member();

alter table public.profiles enable row level security;
alter table public.destinations enable row level security;
alter table public.activities enable row level security;
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.trip_destinations enable row level security;
alter table public.itinerary_items enable row level security;
alter table public.bookings enable row level security;
alter table public.expenses enable row level security;
alter table public.saved_trips enable row level security;
alter table public.saved_places enable row level security;
alter table public.packing_items enable row level security;
alter table public.trip_memories enable row level security;
alter table public.trip_comments enable row level security;
alter table public.trip_reactions enable row level security;
alter table public.join_requests enable row level security;
alter table public.activity_votes enable row level security;
alter table public.notifications enable row level security;
alter table public.visited_countries enable row level security;

revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

create policy profiles_read on public.profiles for select to authenticated using (true);
create policy profiles_insert on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy profiles_update on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy destinations_read on public.destinations for select to authenticated using (is_published);
create policy activities_read on public.activities for select to authenticated using (is_published);

create policy trips_read on public.trips for select to authenticated using (visibility = 'public' or (select private.is_trip_member(id)));
create policy trips_insert on public.trips for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy trips_update on public.trips for update to authenticated using ((select private.can_manage_trip(id))) with check ((select private.can_manage_trip(id)));
create policy trips_delete on public.trips for delete to authenticated using ((select private.can_manage_trip(id)));

create policy members_read on public.trip_members for select to authenticated using ((select private.is_trip_member(trip_id)));
create policy members_insert on public.trip_members for insert to authenticated with check ((select private.can_manage_trip(trip_id)));
create policy members_update on public.trip_members for update to authenticated using ((select private.can_manage_trip(trip_id))) with check ((select private.can_manage_trip(trip_id)));
create policy members_delete on public.trip_members for delete to authenticated using ((select private.can_manage_trip(trip_id)) and role <> 'owner');

create policy trip_destinations_read on public.trip_destinations for select to authenticated using ((select private.is_trip_member(trip_id)));
create policy trip_destinations_insert on public.trip_destinations for insert to authenticated with check ((select private.can_edit_trip(trip_id)));
create policy trip_destinations_update on public.trip_destinations for update to authenticated using ((select private.can_edit_trip(trip_id))) with check ((select private.can_edit_trip(trip_id)));
create policy trip_destinations_delete on public.trip_destinations for delete to authenticated using ((select private.can_edit_trip(trip_id)));

create policy itinerary_read on public.itinerary_items for select to authenticated using ((select private.is_trip_member(trip_id)));
create policy itinerary_insert on public.itinerary_items for insert to authenticated with check ((select private.can_edit_trip(trip_id)) and (select auth.uid()) = created_by);
create policy itinerary_update on public.itinerary_items for update to authenticated using ((select private.can_edit_trip(trip_id))) with check ((select private.can_edit_trip(trip_id)));
create policy itinerary_delete on public.itinerary_items for delete to authenticated using ((select private.can_edit_trip(trip_id)));

create policy bookings_read on public.bookings for select to authenticated using ((select private.is_trip_member(trip_id)));
create policy bookings_insert on public.bookings for insert to authenticated with check ((select private.can_edit_trip(trip_id)) and (select auth.uid()) = created_by);
create policy bookings_update on public.bookings for update to authenticated using ((select private.can_edit_trip(trip_id))) with check ((select private.can_edit_trip(trip_id)));
create policy bookings_delete on public.bookings for delete to authenticated using ((select private.can_edit_trip(trip_id)));

create policy expenses_read on public.expenses for select to authenticated using ((select private.is_trip_member(trip_id)));
create policy expenses_insert on public.expenses for insert to authenticated with check ((select private.can_edit_trip(trip_id)) and (select private.is_trip_member(trip_id)));
create policy expenses_update on public.expenses for update to authenticated using ((select private.can_edit_trip(trip_id))) with check ((select private.can_edit_trip(trip_id)));
create policy expenses_delete on public.expenses for delete to authenticated using ((select private.can_edit_trip(trip_id)));

create policy saved_trips_own on public.saved_trips for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy saved_places_own on public.saved_places for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy packing_read on public.packing_items for select to authenticated using ((select private.is_trip_member(trip_id)));
create policy packing_insert on public.packing_items for insert to authenticated with check ((select private.can_edit_trip(trip_id)) and (select auth.uid()) = created_by);
create policy packing_update on public.packing_items for update to authenticated using ((select private.can_edit_trip(trip_id))) with check ((select private.can_edit_trip(trip_id)));
create policy packing_delete on public.packing_items for delete to authenticated using ((select private.can_edit_trip(trip_id)));
create policy memories_read on public.trip_memories for select to authenticated using ((select private.is_trip_member(trip_id)));
create policy memories_insert on public.trip_memories for insert to authenticated with check ((select private.can_edit_trip(trip_id)) and (select auth.uid()) = created_by);
create policy memories_update on public.trip_memories for update to authenticated using ((select private.can_edit_trip(trip_id))) with check ((select private.can_edit_trip(trip_id)));
create policy memories_delete on public.trip_memories for delete to authenticated using ((select private.can_edit_trip(trip_id)));

create policy comments_read on public.trip_comments for select to authenticated using ((select private.is_trip_member(trip_id)) or exists (select 1 from public.trips t where t.id = trip_id and t.visibility = 'public'));
create policy comments_insert on public.trip_comments for insert to authenticated with check ((select auth.uid()) = author_id and ((select private.is_trip_member(trip_id)) or exists (select 1 from public.trips t where t.id = trip_id and t.visibility = 'public')));
create policy comments_update on public.trip_comments for update to authenticated using ((select auth.uid()) = author_id) with check ((select auth.uid()) = author_id);
create policy comments_delete on public.trip_comments for delete to authenticated using ((select auth.uid()) = author_id or (select private.can_manage_trip(trip_id)));
create policy reactions_read on public.trip_reactions for select to authenticated using (exists (select 1 from public.trips t where t.id = trip_id and (t.visibility = 'public' or (select private.is_trip_member(t.id)))));
create policy reactions_insert on public.trip_reactions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy reactions_delete on public.trip_reactions for delete to authenticated using ((select auth.uid()) = user_id);

create policy join_requests_read on public.join_requests for select to authenticated using ((select auth.uid()) = requester_id or (select private.can_manage_trip(trip_id)));
create policy join_requests_insert on public.join_requests for insert to authenticated with check ((select auth.uid()) = requester_id and exists (select 1 from public.trips t where t.id = trip_id and t.visibility = 'public'));
create policy join_requests_update on public.join_requests for update to authenticated using ((select private.can_manage_trip(trip_id))) with check ((select private.can_manage_trip(trip_id)));
create policy votes_read on public.activity_votes for select to authenticated using (exists (select 1 from public.itinerary_items i where i.id = itinerary_item_id and (select private.is_trip_member(i.trip_id))));
create policy votes_insert on public.activity_votes for insert to authenticated with check ((select auth.uid()) = user_id and exists (select 1 from public.itinerary_items i where i.id = itinerary_item_id and (select private.is_trip_member(i.trip_id))));
create policy votes_delete on public.activity_votes for delete to authenticated using ((select auth.uid()) = user_id);
create policy notifications_own on public.notifications for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy countries_own on public.visited_countries for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trypo-private', 'trypo-private', false, 52428800, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create policy storage_read_own on storage.objects for select to authenticated
using (bucket_id = 'trypo-private' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy storage_insert_own on storage.objects for insert to authenticated
with check (bucket_id = 'trypo-private' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy storage_update_own on storage.objects for update to authenticated
using (bucket_id = 'trypo-private' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'trypo-private' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy storage_delete_own on storage.objects for delete to authenticated
using (bucket_id = 'trypo-private' and (storage.foldername(name))[1] = (select auth.uid())::text);
