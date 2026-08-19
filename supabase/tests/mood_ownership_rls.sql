-- Run against ADDI Dev only. Every fixture row and temporary auth user is rolled back.
begin;

select pg_catalog.set_config(
  'fixture.user_a',
  (select id::text from auth.users order by created_at limit 1),
  true
);
select pg_catalog.set_config('fixture.user_b', pg_catalog.gen_random_uuid()::text, true);

insert into auth.users (id, aud, role, created_at, updated_at, is_sso_user, is_anonymous)
values (
  pg_catalog.current_setting('fixture.user_b')::uuid,
  'authenticated',
  'authenticated',
  pg_catalog.now(),
  pg_catalog.now(),
  false,
  false
);

insert into public.mood_records (user_id, mood_date, mood, recorded_at, summary)
values
  (
    pg_catalog.current_setting('fixture.user_a')::uuid,
    current_date + 10000,
    'good',
    pg_catalog.now(),
    'fixture a'
  ),
  (
    pg_catalog.current_setting('fixture.user_b')::uuid,
    current_date + 10001,
    'lethargic',
    pg_catalog.now(),
    'fixture b'
  );

select pg_catalog.set_config(
  'request.jwt.claim.sub',
  pg_catalog.current_setting('fixture.user_a'),
  true
);
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

do $fixture$
declare
  v_count integer;
begin
  update public.mood_records
  set summary = 'must not change'
  where user_id = pg_catalog.current_setting('fixture.user_b')::uuid;
  get diagnostics v_count = row_count;
  if v_count <> 0 then
    raise exception 'Cross-user UPDATE was not blocked.';
  end if;

  delete from public.mood_records
  where user_id = pg_catalog.current_setting('fixture.user_b')::uuid;
  get diagnostics v_count = row_count;
  if v_count <> 0 then
    raise exception 'Cross-user DELETE was not blocked.';
  end if;

  begin
    insert into public.mood_records (user_id, mood_date, mood, recorded_at, summary)
    values (
      pg_catalog.current_setting('fixture.user_b')::uuid,
      current_date + 10002,
      'good',
      pg_catalog.now(),
      'must be blocked'
    );
    raise exception 'Cross-user INSERT was not blocked.';
  exception
    when insufficient_privilege then null;
  end;
end;
$fixture$;

do $fixture$
declare
  v_visible_count integer;
  v_cross_user_count integer;
begin
  select
    pg_catalog.count(*),
    pg_catalog.count(*) filter (
      where user_id = pg_catalog.current_setting('fixture.user_b')::uuid
    )
  into v_visible_count, v_cross_user_count
  from public.mood_records
  where mood_date >= current_date + 10000;

  if v_visible_count <> 1 or v_cross_user_count <> 0 then
    raise exception 'Cross-user SELECT was not blocked.';
  end if;
end;
$fixture$;

rollback;
