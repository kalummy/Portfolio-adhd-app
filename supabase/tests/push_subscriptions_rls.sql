-- Run after the Phase 2 migration against ADDI Dev only. The transaction rolls back.
begin;

select pg_catalog.set_config(
  'fixture.push_user_a',
  (select id::text from auth.users order by created_at limit 1),
  true
);
select pg_catalog.set_config('fixture.push_user_b', pg_catalog.gen_random_uuid()::text, true);

insert into auth.users (id, aud, role, created_at, updated_at, is_sso_user, is_anonymous)
values (
  pg_catalog.current_setting('fixture.push_user_b')::uuid,
  'authenticated',
  'authenticated',
  pg_catalog.now(),
  pg_catalog.now(),
  false,
  false
);

insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
values
  (
    pg_catalog.current_setting('fixture.push_user_a')::uuid,
    'https://push.example.test/phase2-user-a',
    repeat('a', 65),
    repeat('a', 22)
  ),
  (
    pg_catalog.current_setting('fixture.push_user_b')::uuid,
    'https://push.example.test/phase2-user-b',
    repeat('b', 65),
    repeat('b', 22)
  );

select pg_catalog.set_config(
  'request.jwt.claim.sub',
  pg_catalog.current_setting('fixture.push_user_a'),
  true
);
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

do $fixture$
declare
  v_visible integer;
  v_other integer;
begin
  select
    pg_catalog.count(*),
    pg_catalog.count(*) filter (
      where user_id = pg_catalog.current_setting('fixture.push_user_b')::uuid
    )
  into v_visible, v_other
  from public.push_subscriptions
  where endpoint like 'https://push.example.test/phase2-%';

  if v_visible <> 1 or v_other <> 0 then
    raise exception 'Cross-user push subscription SELECT was not blocked.';
  end if;
end;
$fixture$;

do $fixture$
declare
  v_count integer;
begin
  delete from public.push_subscriptions
  where endpoint = 'https://push.example.test/phase2-user-b';
  get diagnostics v_count = row_count;
  if v_count <> 0 then
    raise exception 'Cross-user push subscription DELETE was not blocked.';
  end if;

  begin
    insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
    values (
      pg_catalog.current_setting('fixture.push_user_a')::uuid,
      'https://push.example.test/must-be-blocked',
      repeat('c', 65),
      repeat('c', 22)
    );
    raise exception 'Authenticated users can INSERT push subscriptions directly.';
  exception
    when insufficient_privilege then null;
  end;

  begin
    update public.push_subscriptions
    set revoked_at = pg_catalog.now()
    where endpoint = 'https://push.example.test/phase2-user-a';
    raise exception 'Authenticated users can UPDATE push subscriptions directly.';
  exception
    when insufficient_privilege then null;
  end;

  delete from public.push_subscriptions
  where endpoint = 'https://push.example.test/phase2-user-a';
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'Owner could not DELETE their push subscription.';
  end if;
end;
$fixture$;

rollback;
