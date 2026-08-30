-- Run against ADDI Dev only. All rows and auth fixtures are rolled back.
begin;

select pg_catalog.set_config('fixture.notification_user_a', pg_catalog.gen_random_uuid()::text, true);
select pg_catalog.set_config('fixture.notification_user_b', pg_catalog.gen_random_uuid()::text, true);

insert into auth.users (id, aud, role, created_at, updated_at, is_sso_user, is_anonymous)
values
  (
    pg_catalog.current_setting('fixture.notification_user_a')::uuid,
    'authenticated',
    'authenticated',
    pg_catalog.now(),
    pg_catalog.now(),
    false,
    false
  ),
  (
    pg_catalog.current_setting('fixture.notification_user_b')::uuid,
    'authenticated',
    'authenticated',
    pg_catalog.now(),
    pg_catalog.now(),
    false,
    false
  );

insert into public.notifications (
  user_id,
  notification_type,
  title,
  body,
  route,
  local_date,
  reminder_slot,
  dedupe_key
)
values
  (
    pg_catalog.current_setting('fixture.notification_user_a')::uuid,
    'medication_reminder',
    '복용 알림',
    '오늘 복용기록이 없어요.',
    '/',
    current_date + 10000,
    '10:00',
    'fixture:a'
  ),
  (
    pg_catalog.current_setting('fixture.notification_user_b')::uuid,
    'medication_reminder',
    '복용 알림',
    '오늘 복용기록이 없어요.',
    '/',
    current_date + 10000,
    '10:00',
    'fixture:b'
  );

select pg_catalog.set_config(
  'request.jwt.claim.sub',
  pg_catalog.current_setting('fixture.notification_user_a'),
  true
);
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

do $fixture$
declare
  v_visible_count integer;
  v_updated_count integer;
begin
  select pg_catalog.count(*) into v_visible_count
  from public.notifications
  where dedupe_key like 'fixture:%';
  if v_visible_count <> 1 then
    raise exception 'Cross-user notification SELECT was not blocked.';
  end if;

  update public.notifications
  set read_at = pg_catalog.now()
  where dedupe_key = 'fixture:a';
  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 1 then
    raise exception 'Owner could not mark a notification as read.';
  end if;

  update public.notifications
  set read_at = pg_catalog.now()
  where dedupe_key = 'fixture:b';
  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 0 then
    raise exception 'Cross-user notification UPDATE was not blocked.';
  end if;

  begin
    update public.notifications
    set body = 'must not change'
    where dedupe_key = 'fixture:a';
    raise exception 'Notification content UPDATE was not blocked.';
  exception
    when insufficient_privilege then null;
  end;
end;
$fixture$;

rollback;
