-- Allow a requester to withdraw their own join request. This is used by the
-- "Leave trip" flow so that a member who leaves a community trip also clears
-- their request record, and the join status returns to "none" everywhere.
create policy "join_requests_delete_own"
on public.join_requests
for delete to authenticated
using (requester_id = (select auth.uid()));