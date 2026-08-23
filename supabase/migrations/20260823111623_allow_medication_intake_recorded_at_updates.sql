grant update (recorded_at)
on table public.medication_intake_records
to authenticated;

create policy "Users can update their own medication intake records"
on public.medication_intake_records
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
