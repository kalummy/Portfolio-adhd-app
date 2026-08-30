create table public.app_notifications (
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_id text not null,
  kind text not null check (
    kind in ('medication', 'visit_eve', 'visit_day', 'mood', 'focus')
  ),
  title text not null,
  body text not null,
  url text not null,
  fired_at timestamptz not null,
  read_at timestamptz,
  primary key (user_id, notification_id)
);

create index app_notifications_user_unread_idx
on public.app_notifications (user_id, fired_at desc)
where read_at is null;

create index app_notifications_user_fired_at_idx
on public.app_notifications (user_id, fired_at desc);

alter table public.app_notifications enable row level security;

revoke all on table public.app_notifications from public, anon, authenticated;

grant select, insert, update on table public.app_notifications to authenticated;

create policy "Users can read their own app notifications"
on public.app_notifications
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their own app notifications"
on public.app_notifications
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own app notifications"
on public.app_notifications
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
