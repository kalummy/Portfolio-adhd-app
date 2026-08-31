-- Run after the Phase 1 notification migration against ADDI Dev only.
-- Every fixture row and temporary auth user is rolled back.
begin;

select pg_catalog.set_config(
  'fixture.notification_user_a',
  pg_catalog.gen_random_uuid()::text,
  true
);
select pg_catalog.set_config(
  'fixture.notification_user_b',
  pg_catalog.gen_random_uuid()::text,
  true
);

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

insert into public.app_notifications (
  user_id,
  notification_id,
  kind,
  title,
  body,
  url
)
values
  (
    pg_catalog.current_setting('fixture.notification_user_a')::uuid,
    'phase1-fixture-user-a',
    'medication',
    '복용 알림',
    '오늘 복용기록이 없어요.',
    '/'
  ),
  (
    pg_catalog.current_setting('fixture.notification_user_b')::uuid,
    'phase1-fixture-user-b',
    'visit_day',
    '내원 알림',
    '오늘은 내원일이에요.',
    '/visits'
  );

do $fixture$
begin
  if exists (
    select 1
    from public.app_notifications
    where notification_id like 'phase1-fixture-%'
      and fired_at is null
  ) then
    raise exception 'The fired_at default was not applied.';
  end if;
end;
$fixture$;

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
  v_cross_user_count integer;
begin
  select
    pg_catalog.count(*),
    pg_catalog.count(*) filter (
      where user_id = pg_catalog.current_setting('fixture.notification_user_b')::uuid
    )
  into v_visible_count, v_cross_user_count
  from public.app_notifications
  where notification_id like 'phase1-fixture-%';

  if v_visible_count <> 1 or v_cross_user_count <> 0 then
    raise exception 'Cross-user notification SELECT was not blocked.';
  end if;
end;
$fixture$;

do $fixture$
declare
  v_count integer;
begin
  update public.app_notifications
  set read_at = pg_catalog.now()
  where notification_id = 'phase1-fixture-user-a';
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'Owner could not mark a notification read.';
  end if;

  update public.app_notifications
  set read_at = pg_catalog.now()
  where notification_id = 'phase1-fixture-user-b';
  get diagnostics v_count = row_count;
  if v_count <> 0 then
    raise exception 'Cross-user notification UPDATE was not blocked.';
  end if;

  begin
    update public.app_notifications
    set title = 'must be blocked'
    where notification_id = 'phase1-fixture-user-a';
    raise exception 'Authenticated users can update protected notification columns.';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.app_notifications (
      user_id,
      notification_id,
      kind,
      title,
      body,
      url,
      fired_at
    )
    values (
      pg_catalog.current_setting('fixture.notification_user_a')::uuid,
      'must-be-blocked',
      'mood',
      '감정기록 알림',
      '오늘의 감정은 어떠셨나요?',
      '/moods/new',
      pg_catalog.now()
    );
    raise exception 'Authenticated users can create notifications.';
  exception
    when insufficient_privilege then null;
  end;

  begin
    delete from public.app_notifications
    where notification_id = 'phase1-fixture-user-a';
    raise exception 'Authenticated users can delete notifications.';
  exception
    when insufficient_privilege then null;
  end;
end;
$fixture$;

reset role;

do $fixture$
begin
  begin
    insert into public.app_notifications (
      user_id,
      notification_id,
      kind,
      title,
      body,
      url
    )
    values (
      pg_catalog.current_setting('fixture.notification_user_a')::uuid,
      'must-reject-kind',
      'focus',
      '잘못된 알림',
      '잘못된 알림입니다.',
      '/'
    );
    raise exception 'Unsupported notification kinds are accepted.';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.app_notifications (
      user_id,
      notification_id,
      kind,
      title,
      body,
      url
    )
    values (
      pg_catalog.current_setting('fixture.notification_user_a')::uuid,
      'must-reject-target',
      'medication',
      '잘못된 알림',
      '잘못된 알림입니다.',
      '/visits'
    );
    raise exception 'Unsupported notification target URLs are accepted.';
  exception
    when check_violation then null;
  end;
end;
$fixture$;

set local role service_role;

insert into public.app_notifications (
  user_id,
  notification_id,
  kind,
  title,
  body,
  url
)
values (
  pg_catalog.current_setting('fixture.notification_user_a')::uuid,
  'phase1-fixture-service-role',
  'mood',
  '감정기록 알림',
  '오늘의 감정은 어떠셨나요?',
  '/moods/new'
);

update public.app_notifications
set read_at = pg_catalog.now()
where notification_id = 'phase1-fixture-service-role';

delete from public.app_notifications
where notification_id = 'phase1-fixture-service-role';

reset role;

rollback;
