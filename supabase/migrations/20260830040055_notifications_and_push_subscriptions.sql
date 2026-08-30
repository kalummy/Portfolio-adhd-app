-- ADDI notifications and Web Push infrastructure.
-- Announcement remains a reserved type, but this migration does not create
-- announcement rows or expose a client-side insert path for them.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  notification_type text not null,
  title text not null,
  body text not null,
  route text,
  local_date date,
  reminder_slot text,
  dedupe_key text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_type_check check (
    notification_type in (
      'medication_reminder',
      'visit_reminder',
      'mood_reminder',
      'announcement'
    )
  ),
  constraint notifications_reminder_slot_check check (
    reminder_slot is null
    or reminder_slot in ('10:00', '13:00', '16:00', '22:00')
  ),
  constraint notifications_route_check check (
    route is null
    or route = '/'
    or route ~ '^/\\?date=[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or route = '/visits'
    or route = '/moods?tab=report'
  ),
  constraint notifications_content_check check (
    (
      notification_type = 'medication_reminder'
      and title = '복용 알림'
      and body = '오늘 복용기록이 없어요.'
    )
    or (
      notification_type = 'visit_reminder'
      and title = '내원 알림'
      and body = '오늘은 내원일이에요.'
    )
    or (
      notification_type = 'mood_reminder'
      and title = '감정기록 알림'
      and body = '지금 리포트 결과를 확인해보세요.'
    )
    or notification_type = 'announcement'
  ),
  constraint notifications_user_dedupe_key_key unique (user_id, dedupe_key)
);

create unique index notifications_medication_reminder_slot_key
on public.notifications (user_id, notification_type, local_date, reminder_slot)
where notification_type = 'medication_reminder';

create index notifications_user_created_at_idx
on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

revoke all on table public.notifications from public, anon, authenticated;
grant select on table public.notifications to authenticated;
grant update (read_at) on table public.notifications to authenticated;
grant select, insert, update, delete on table public.notifications to service_role;

create policy "Users can read their own notifications"
on public.notifications
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can mark their own notifications as read"
on public.notifications
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create table public.push_subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_subscriptions_endpoint_length_check check (
    char_length(endpoint) between 1 and 2048
  ),
  constraint push_subscriptions_p256dh_length_check check (
    char_length(p256dh) between 1 and 512
  ),
  constraint push_subscriptions_auth_length_check check (
    char_length(auth) between 1 and 512
  )
);

alter table public.push_subscriptions enable row level security;

revoke all on table public.push_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on table public.push_subscriptions to service_role;

create table public.notification_push_deliveries (
  notification_id uuid primary key references public.notifications (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'claimed',
  claimed_at timestamptz not null default now(),
  completed_at timestamptz,
  error_code text,
  constraint notification_push_deliveries_status_check check (
    status in ('claimed', 'sent', 'failed')
  )
);

create index notification_push_deliveries_user_claimed_at_idx
on public.notification_push_deliveries (user_id, claimed_at desc);

alter table public.notification_push_deliveries enable row level security;

revoke all on table public.notification_push_deliveries
from public, anon, authenticated;
grant select, insert, update, delete
on table public.notification_push_deliveries to service_role;

create or replace function public.generate_due_notifications(
  p_now timestamptz default now()
)
returns table (
  medication_count integer,
  visit_count integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_local_timestamp timestamp := p_now at time zone 'Asia/Seoul';
  v_local_date date := v_local_timestamp::date;
  v_reminder_slot text := pg_catalog.to_char(v_local_timestamp, 'HH24:MI');
  v_medication_count integer := 0;
  v_visit_count integer := 0;
begin
  if v_reminder_slot in ('10:00', '13:00', '16:00', '22:00') then
    with inserted_medication_notifications as (
      insert into public.notifications (
        user_id,
        notification_type,
        title,
        body,
        route,
        local_date,
        reminder_slot,
        dedupe_key,
        created_at
      )
      select distinct
        medication.user_id,
        'medication_reminder',
        '복용 알림',
        '오늘 복용기록이 없어요.',
        '/?date=' || v_local_date::text,
        v_local_date,
        v_reminder_slot,
        'medication:' || v_local_date::text || ':' || v_reminder_slot,
        p_now
      from public.user_medications as medication
      where medication.active = true
        and not exists (
          select 1
          from public.medication_intake_records as intake
          where intake.user_id = medication.user_id
            and intake.intake_date = v_local_date
        )
      on conflict (user_id, dedupe_key) do nothing
      returning 1
    )
    select pg_catalog.count(*)::integer
    into v_medication_count
    from inserted_medication_notifications;
  end if;

  with inserted_visit_notifications as (
    insert into public.notifications (
      user_id,
      notification_type,
      title,
      body,
      route,
      local_date,
      dedupe_key,
      created_at
    )
    select
      visit.user_id,
      'visit_reminder',
      '내원 알림',
      '오늘은 내원일이에요.',
      '/visits',
      v_local_date,
      'visit:' || v_local_date::text,
      p_now
    from public.visit_schedules as visit
    where visit.visit_date = v_local_date
    on conflict (user_id, dedupe_key) do nothing
    returning 1
  )
  select pg_catalog.count(*)::integer
  into v_visit_count
  from inserted_visit_notifications;

  return query select v_medication_count, v_visit_count;
end;
$$;

revoke all on function public.generate_due_notifications(timestamptz) from public;
revoke all on function public.generate_due_notifications(timestamptz) from anon;
revoke all on function public.generate_due_notifications(timestamptz) from authenticated;
grant execute on function public.generate_due_notifications(timestamptz) to service_role;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.create_mood_completion_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.analysis_status is distinct from 'completed' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.analysis_status = 'completed' then
      return new;
    end if;
  end if;

  insert into public.notifications (
    user_id,
    notification_type,
    title,
    body,
    route,
    local_date,
    dedupe_key,
    created_at
  ) values (
    new.user_id,
    'mood_reminder',
    '감정기록 알림',
    '지금 리포트 결과를 확인해보세요.',
    '/moods?tab=report',
    new.mood_date,
    'mood:' || new.mood_date::text,
    coalesce(new.analysis_created_at, now())
  )
  on conflict (user_id, dedupe_key) do nothing;

  return new;
end;
$$;

revoke all on function private.create_mood_completion_notification() from public;
revoke all on function private.create_mood_completion_notification() from anon;
revoke all on function private.create_mood_completion_notification() from authenticated;
revoke all on function private.create_mood_completion_notification() from service_role;

create trigger mood_records_create_notification_after_completion
after insert or update of analysis_status
on public.mood_records
for each row
execute function private.create_mood_completion_notification();
