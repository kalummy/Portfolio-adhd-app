do $migration$
begin
  if exists (
    select 1
    from public.app_notifications
    where kind not in ('medication', 'visit_day', 'mood')
  ) then
    raise exception 'app_notifications contains unsupported notification kinds.';
  end if;

  if exists (
    select 1
    from public.app_notifications
    where not (
      (kind = 'medication' and url = '/')
      or (kind = 'visit_day' and url = '/visits')
      or (kind = 'mood' and url = '/moods?tab=report')
    )
  ) then
    raise exception 'app_notifications contains unsupported target URLs.';
  end if;
end;
$migration$;

alter table public.app_notifications
  alter column fired_at set default now();

alter table public.app_notifications
  drop constraint if exists app_notifications_kind_check;

alter table public.app_notifications
  add constraint app_notifications_kind_check
  check (kind in ('medication', 'visit_day', 'mood'))
  not valid;

alter table public.app_notifications
  validate constraint app_notifications_kind_check;

alter table public.app_notifications
  drop constraint if exists app_notifications_target_url_check;

alter table public.app_notifications
  add constraint app_notifications_target_url_check
  check (
    (kind = 'medication' and url = '/')
    or (kind = 'visit_day' and url = '/visits')
    or (kind = 'mood' and url = '/moods?tab=report')
  )
  not valid;

alter table public.app_notifications
  validate constraint app_notifications_target_url_check;

alter table public.app_notifications enable row level security;

revoke all on table public.app_notifications from public, anon;
revoke insert, update, delete on table public.app_notifications from authenticated;
revoke update (
  user_id,
  notification_id,
  kind,
  title,
  body,
  url,
  fired_at
) on table public.app_notifications from authenticated;

grant select on table public.app_notifications to authenticated;
grant update (read_at) on table public.app_notifications to authenticated;
grant select, insert, update, delete on table public.app_notifications to service_role;

drop policy if exists "Users can create their own app notifications"
on public.app_notifications;

drop policy if exists "Users can delete their own app notifications"
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
