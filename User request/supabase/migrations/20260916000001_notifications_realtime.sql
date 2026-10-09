-- Broadcast notifications to the receiving user in realtime.
-- RLS (notifications_own: auth.uid() = user_id) ensures each subscriber
-- only receives their own rows, so join requests / decisions appear live
-- in the bell without any polling.
do $$
declare
  t text;
begin
  foreach t in array array['notifications']
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