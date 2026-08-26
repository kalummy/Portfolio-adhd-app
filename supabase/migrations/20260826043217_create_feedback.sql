create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  feedback_text text not null check (
    pg_catalog.char_length(pg_catalog.btrim(feedback_text)) between 1 and 2000
  ),
  created_at timestamptz not null default now(),
  route text not null default '/feedback' check (route = '/feedback'),
  user_id uuid references auth.users(id) on delete set null
);

create index feedback_user_id_idx on public.feedback (user_id);

alter table public.feedback enable row level security;

revoke all on table public.feedback from public, anon, authenticated;
grant insert on table public.feedback to anon, authenticated;

create policy "Guests can submit feedback"
on public.feedback
for insert
to anon
with check (user_id is null);

create policy "Users can submit their own feedback"
on public.feedback
for insert
to authenticated
with check ((select auth.uid()) = user_id);
