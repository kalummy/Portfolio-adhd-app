create table if not exists public.app_notifications (
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_id text not null,
  kind text not null,
  title text not null,
  body text not null,
  url text not null,
  fired_at timestamptz not null default now(),
  read_at timestamptz,
  primary key (user_id, notification_id)
);

alter table public.app_notifications
  drop constraint if exists app_notifications_kind_check;

alter table public.app_notifications
  add constraint app_notifications_kind_check
  check (kind in ('medication', 'visit_day', 'mood'));

alter table public.app_notifications
  drop constraint if exists app_notifications_target_url_check;

alter table public.app_notifications
  add constraint app_notifications_target_url_check
  check (
    (kind = 'medication' and url = '/')
    or (kind = 'visit_day' and url = '/visits')
    or (kind = 'mood' and url = '/moods?tab=report')
  );

create index if not exists app_notifications_user_fired_at_idx
on public.app_notifications (user_id, fired_at desc);

create index if not exists app_notifications_user_unread_idx
on public.app_notifications (user_id, fired_at desc)
where read_at is null;

alter table public.app_notifications enable row level security;

revoke all on table public.app_notifications from public, anon;
revoke insert, update, delete on table public.app_notifications from authenticated;
grant select on table public.app_notifications to authenticated;
grant update (read_at) on table public.app_notifications to authenticated;
grant select, insert, update, delete on table public.app_notifications to service_role;

drop policy if exists "Users can create their own app notifications"
on public.app_notifications;

drop policy if exists "Users can read their own app notifications"
on public.app_notifications;

create policy "Users can read their own app notifications"
on public.app_notifications
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own app notifications"
on public.app_notifications;

create policy "Users can update their own app notifications"
on public.app_notifications
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
