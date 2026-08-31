-- Run after 20260831050744_create_reminder_scheduler.sql against ADDI Dev only.
-- All synthetic users, health records, subscriptions, dispatches, and inbox rows roll back.
begin;

select pg_catalog.set_config('fixture.reminder_daily', pg_catalog.gen_random_uuid()::text, true);
select pg_catalog.set_config('fixture.reminder_all_daily', pg_catalog.gen_random_uuid()::text, true);
select pg_catalog.set_config('fixture.reminder_prn', pg_catalog.gen_random_uuid()::text, true);
select pg_catalog.set_config('fixture.reminder_both', pg_catalog.gen_random_uuid()::text, true);
select pg_catalog.set_config('fixture.reminder_bedtime', pg_catalog.gen_random_uuid()::text, true);
select pg_catalog.set_config('fixture.reminder_mood', pg_catalog.gen_random_uuid()::text, true);
select pg_catalog.set_config('fixture.reminder_mood_done', pg_catalog.gen_random_uuid()::text, true);
select pg_catalog.set_config('fixture.reminder_no_med', pg_catalog.gen_random_uuid()::text, true);
select pg_catalog.set_config('fixture.reminder_med_off', pg_catalog.gen_random_uuid()::text, true);
select pg_catalog.set_config('fixture.reminder_mood_off', pg_catalog.gen_random_uuid()::text, true);
select pg_catalog.set_config('fixture.reminder_revoked', pg_catalog.gen_random_uuid()::text, true);
select pg_catalog.set_config('fixture.reminder_exact', pg_catalog.gen_random_uuid()::text, true);
select pg_catalog.set_config('fixture.visit_tomorrow', pg_catalog.gen_random_uuid()::text, true);
select pg_catalog.set_config('fixture.visit_today', pg_catalog.gen_random_uuid()::text, true);
select pg_catalog.set_config('fixture.visit_yesterday', pg_catalog.gen_random_uuid()::text, true);
select pg_catalog.set_config('fixture.visit_off', pg_catalog.gen_random_uuid()::text, true);
select pg_catalog.set_config('fixture.visit_revoked', pg_catalog.gen_random_uuid()::text, true);
select pg_catalog.set_config('fixture.visit_changed', pg_catalog.gen_random_uuid()::text, true);
select pg_catalog.set_config('fixture.visit_deleted', pg_catalog.gen_random_uuid()::text, true);
select pg_catalog.set_config('fixture.visit_window', pg_catalog.gen_random_uuid()::text, true);

insert into auth.users (id, aud, role, created_at, updated_at, is_sso_user, is_anonymous)
select
  fixture.user_id,
  'authenticated',
  'authenticated',
  pg_catalog.now(),
  pg_catalog.now(),
  false,
  false
from (
  values
    (pg_catalog.current_setting('fixture.reminder_daily')::uuid),
    (pg_catalog.current_setting('fixture.reminder_all_daily')::uuid),
    (pg_catalog.current_setting('fixture.reminder_prn')::uuid),
    (pg_catalog.current_setting('fixture.reminder_both')::uuid),
    (pg_catalog.current_setting('fixture.reminder_bedtime')::uuid),
    (pg_catalog.current_setting('fixture.reminder_mood')::uuid),
    (pg_catalog.current_setting('fixture.reminder_mood_done')::uuid),
    (pg_catalog.current_setting('fixture.reminder_no_med')::uuid),
    (pg_catalog.current_setting('fixture.reminder_med_off')::uuid),
    (pg_catalog.current_setting('fixture.reminder_mood_off')::uuid),
    (pg_catalog.current_setting('fixture.reminder_revoked')::uuid),
    (pg_catalog.current_setting('fixture.reminder_exact')::uuid),
    (pg_catalog.current_setting('fixture.visit_tomorrow')::uuid),
    (pg_catalog.current_setting('fixture.visit_today')::uuid),
    (pg_catalog.current_setting('fixture.visit_yesterday')::uuid),
    (pg_catalog.current_setting('fixture.visit_off')::uuid),
    (pg_catalog.current_setting('fixture.visit_revoked')::uuid),
    (pg_catalog.current_setting('fixture.visit_changed')::uuid),
    (pg_catalog.current_setting('fixture.visit_deleted')::uuid),
    (pg_catalog.current_setting('fixture.visit_window')::uuid)
) as fixture(user_id);

insert into public.user_medications (
  user_id,
  id,
  name,
  strength_value,
  strength_unit,
  image_path,
  registration_method,
  schedule,
  active
)
values
  (pg_catalog.current_setting('fixture.reminder_daily')::uuid, 'daily-a', 'fixture', 1, 'mg', '/fixture.svg', 'manual', 'daily', true),
  (pg_catalog.current_setting('fixture.reminder_daily')::uuid, 'daily-b', 'fixture', 1, 'mg', '/fixture.svg', 'manual', 'daily', true),
  (pg_catalog.current_setting('fixture.reminder_all_daily')::uuid, 'daily-done', 'fixture', 1, 'mg', '/fixture.svg', 'manual', 'daily', true),
  (pg_catalog.current_setting('fixture.reminder_prn')::uuid, 'prn', 'fixture', 1, 'mg', '/fixture.svg', 'manual', 'as-needed', true),
  (pg_catalog.current_setting('fixture.reminder_both')::uuid, 'both-daily', 'fixture', 1, 'mg', '/fixture.svg', 'manual', 'daily', true),
  (pg_catalog.current_setting('fixture.reminder_both')::uuid, 'both-prn', 'fixture', 1, 'mg', '/fixture.svg', 'manual', 'as-needed', true),
  (pg_catalog.current_setting('fixture.reminder_bedtime')::uuid, 'bedtime', 'fixture', 1, 'mg', '/fixture.svg', 'manual', 'bedtime', true),
  (pg_catalog.current_setting('fixture.reminder_med_off')::uuid, 'disabled-daily', 'fixture', 1, 'mg', '/fixture.svg', 'manual', 'daily', true),
  (pg_catalog.current_setting('fixture.reminder_revoked')::uuid, 'revoked-daily', 'fixture', 1, 'mg', '/fixture.svg', 'manual', 'daily', true);

insert into public.medication_intake_records (
  user_id,
  medication_id,
  intake_date,
  recorded_at
)
values
  (pg_catalog.current_setting('fixture.reminder_daily')::uuid, 'daily-a', date '2026-08-31', timestamptz '2026-08-31 08:00:00+09'),
  (pg_catalog.current_setting('fixture.reminder_all_daily')::uuid, 'daily-done', date '2026-08-31', timestamptz '2026-08-31 08:00:00+09');

insert into public.mood_records (user_id, mood_date, mood, recorded_at, summary)
values (
  pg_catalog.current_setting('fixture.reminder_mood_done')::uuid,
  date '2026-08-31',
  'good',
  timestamptz '2026-08-31 14:00:00+09',
  'fixture'
);

insert into public.push_subscriptions (
  id,
  user_id,
  endpoint,
  p256dh,
  auth,
  medication_enabled,
  mood_enabled,
  revoked_at
)
select
  pg_catalog.gen_random_uuid(),
  fixture.user_id,
  'https://push.example.test/' || fixture.label,
  pg_catalog.repeat('p', 65),
  pg_catalog.repeat('a', 22),
  fixture.medication_enabled,
  fixture.mood_enabled,
  fixture.revoked_at
from (
  values
    (pg_catalog.current_setting('fixture.reminder_daily')::uuid, 'daily', true, true, null::timestamptz),
    (pg_catalog.current_setting('fixture.reminder_all_daily')::uuid, 'all-daily', true, true, null::timestamptz),
    (pg_catalog.current_setting('fixture.reminder_prn')::uuid, 'prn', true, true, null::timestamptz),
    (pg_catalog.current_setting('fixture.reminder_both')::uuid, 'both', true, true, null::timestamptz),
    (pg_catalog.current_setting('fixture.reminder_bedtime')::uuid, 'bedtime', true, true, null::timestamptz),
    (pg_catalog.current_setting('fixture.reminder_mood')::uuid, 'mood', false, true, null::timestamptz),
    (pg_catalog.current_setting('fixture.reminder_mood_done')::uuid, 'mood-done', false, true, null::timestamptz),
    (pg_catalog.current_setting('fixture.reminder_no_med')::uuid, 'no-med', true, true, null::timestamptz),
    (pg_catalog.current_setting('fixture.reminder_med_off')::uuid, 'med-off', false, true, null::timestamptz),
    (pg_catalog.current_setting('fixture.reminder_mood_off')::uuid, 'mood-off', true, false, null::timestamptz),
    (pg_catalog.current_setting('fixture.reminder_revoked')::uuid, 'revoked', true, true, timestamptz '2026-08-30 00:00:00+09')
) as fixture(user_id, label, medication_enabled, mood_enabled, revoked_at);

insert into public.visit_schedules (
  user_id,
  visit_id,
  visit_date,
  created_at,
  updated_at
)
values
  (pg_catalog.current_setting('fixture.visit_tomorrow')::uuid, 'upcoming', date '2026-09-01', timestamptz '2026-08-30 12:00:00+09', timestamptz '2026-08-30 12:00:00+09'),
  (pg_catalog.current_setting('fixture.visit_today')::uuid, 'upcoming', date '2026-08-31', timestamptz '2026-08-30 12:00:00+09', timestamptz '2026-08-30 12:00:00+09'),
  (pg_catalog.current_setting('fixture.visit_yesterday')::uuid, 'upcoming', date '2026-08-30', timestamptz '2026-08-29 12:00:00+09', timestamptz '2026-08-29 12:00:00+09'),
  (pg_catalog.current_setting('fixture.visit_off')::uuid, 'upcoming', date '2026-09-01', timestamptz '2026-08-30 12:00:00+09', timestamptz '2026-08-30 12:00:00+09'),
  (pg_catalog.current_setting('fixture.visit_revoked')::uuid, 'upcoming', date '2026-09-01', timestamptz '2026-08-30 12:00:00+09', timestamptz '2026-08-30 12:00:00+09'),
  (pg_catalog.current_setting('fixture.visit_changed')::uuid, 'upcoming', date '2026-09-01', timestamptz '2026-08-30 12:00:00+09', timestamptz '2026-08-30 12:00:00+09'),
  (pg_catalog.current_setting('fixture.visit_deleted')::uuid, 'upcoming', date '2026-09-01', timestamptz '2026-08-30 12:00:00+09', timestamptz '2026-08-30 12:00:00+09');

insert into public.visit_schedules (
  user_id,
  visit_id,
  visit_date,
  created_at,
  updated_at
)
values (
  pg_catalog.current_setting('fixture.visit_window')::uuid,
  'upcoming',
  date '2026-09-03',
  timestamptz '2026-09-02 12:00:00+09',
  timestamptz '2026-09-02 12:00:00+09'
);

insert into public.push_subscriptions (
  id,
  user_id,
  endpoint,
  p256dh,
  auth,
  medication_enabled,
  visit_day_enabled,
  mood_enabled,
  revoked_at
)
select
  pg_catalog.gen_random_uuid(),
  fixture.user_id,
  'https://push.example.test/' || fixture.label,
  pg_catalog.repeat('v', 65),
  pg_catalog.repeat('z', 22),
  fixture.medication_enabled,
  fixture.visit_day_enabled,
  fixture.mood_enabled,
  fixture.revoked_at
from (
  values
    (pg_catalog.current_setting('fixture.visit_tomorrow')::uuid, 'visit-tomorrow', false, true, false, null::timestamptz),
    (pg_catalog.current_setting('fixture.visit_today')::uuid, 'visit-today', false, true, false, null::timestamptz),
    (pg_catalog.current_setting('fixture.visit_yesterday')::uuid, 'visit-yesterday', false, true, false, null::timestamptz),
    (pg_catalog.current_setting('fixture.visit_off')::uuid, 'visit-off', true, false, true, null::timestamptz),
    (pg_catalog.current_setting('fixture.visit_revoked')::uuid, 'visit-revoked', true, true, true, timestamptz '2026-08-30 00:00:00+09'),
    (pg_catalog.current_setting('fixture.visit_changed')::uuid, 'visit-changed', false, true, false, null::timestamptz),
    (pg_catalog.current_setting('fixture.visit_deleted')::uuid, 'visit-deleted', false, true, false, null::timestamptz)
) as fixture(
  user_id,
  label,
  medication_enabled,
  visit_day_enabled,
  mood_enabled,
  revoked_at
);

insert into public.push_subscriptions (
  id, user_id, endpoint, p256dh, auth, medication_enabled, visit_day_enabled, mood_enabled
)
values (
  pg_catalog.gen_random_uuid(),
  pg_catalog.current_setting('fixture.visit_tomorrow')::uuid,
  'https://push.example.test/visit-tomorrow-second-device',
  pg_catalog.repeat('w', 65),
  pg_catalog.repeat('y', 22),
  false,
  true,
  false
);

insert into public.push_subscriptions (
  id, user_id, endpoint, p256dh, auth, medication_enabled, visit_day_enabled, mood_enabled
)
select
  pg_catalog.gen_random_uuid(),
  pg_catalog.current_setting('fixture.visit_tomorrow')::uuid,
  'https://push.example.test/visit-tomorrow-extra-' || fixture.index,
  pg_catalog.repeat('w', 65),
  pg_catalog.repeat('y', 22),
  false,
  true,
  false
from pg_catalog.generate_series(1, 3) as fixture(index);

insert into public.push_subscriptions (
  id, user_id, endpoint, p256dh, auth, medication_enabled, visit_day_enabled, mood_enabled
)
values (
  pg_catalog.gen_random_uuid(),
  pg_catalog.current_setting('fixture.visit_window')::uuid,
  'https://push.example.test/visit-window',
  pg_catalog.repeat('w', 65),
  pg_catalog.repeat('y', 22),
  false,
  true,
  false
);

do $fixture$
declare
  v_rls boolean;
  v_force_rls boolean;
  v_policy_count integer;
  v_role text;
  v_privilege text;
  v_function_signature text;
begin
  select relation.relrowsecurity, relation.relforcerowsecurity
  into v_rls, v_force_rls
  from pg_catalog.pg_class as relation
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relname = 'reminder_dispatches';

  select pg_catalog.count(*)::integer
  into v_policy_count
  from pg_catalog.pg_policies
  where schemaname = 'public'
    and tablename = 'reminder_dispatches';

  if not v_rls or not v_force_rls or v_policy_count <> 0 then
    raise exception 'reminder_dispatches must use forced RLS with no client policies.';
  end if;

  foreach v_role in array array['anon', 'authenticated'] loop
    foreach v_privilege in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
      if pg_catalog.has_table_privilege(
        v_role,
        'public.reminder_dispatches',
        v_privilege
      ) then
        raise exception '% unexpectedly has % on reminder_dispatches.', v_role, v_privilege;
      end if;
    end loop;
  end loop;

  foreach v_privilege in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
    if not pg_catalog.has_table_privilege(
      'service_role',
      'public.reminder_dispatches',
      v_privilege
    ) then
      raise exception 'service_role is missing % on reminder_dispatches.', v_privilege;
    end if;
  end loop;

  foreach v_function_signature in array array[
    'public.reminder_slot_started_at(date,text)',
    'public.reminder_dispatch_eligibility(uuid,date,text)',
    'public.claim_due_reminder_dispatches(date,text,timestamptz,timestamptz,integer)',
    'public.prepare_reminder_dispatch(uuid,date,text,uuid,timestamptz)',
    'public.finalize_reminder_dispatch(uuid,date,text,uuid,text,text,integer,text,uuid[],timestamptz)'
  ] loop
    foreach v_role in array array['anon', 'authenticated'] loop
      if pg_catalog.has_function_privilege(v_role, v_function_signature, 'EXECUTE') then
        raise exception '% unexpectedly has EXECUTE on %.', v_role, v_function_signature;
      end if;
    end loop;
    if not pg_catalog.has_function_privilege(
      'service_role',
      v_function_signature,
      'EXECUTE'
    ) then
      raise exception 'service_role is missing EXECUTE on %.', v_function_signature;
    end if;
  end loop;
end;
$fixture$;

set local role authenticated;

do $fixture$
begin
  begin
    perform 1 from public.reminder_dispatches limit 1;
    raise exception 'Authenticated users can read reminder dispatches.';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform *
    from public.claim_due_reminder_dispatches(
      date '2026-08-31',
      'medication_0900',
      timestamptz '2026-08-31 09:00:00+09',
      timestamptz '2026-08-31 09:30:00+09',
      20
    );
    raise exception 'Authenticated users can execute reminder RPCs.';
  exception
    when insufficient_privilege then null;
  end;
end;
$fixture$;

reset role;
set local role service_role;

do $fixture$
begin
  begin
    perform *
    from public.claim_due_reminder_dispatches(
      date '2026-08-31',
      'medication_0900',
      timestamptz '2026-08-31 09:00:00+09',
      timestamptz '2026-08-31 09:30:00+09',
      null
    );
    raise exception 'NULL batch limit was accepted.';
  exception
    when invalid_parameter_value then null;
  end;

  begin
    perform *
    from public.prepare_reminder_dispatch(
      pg_catalog.current_setting('fixture.reminder_daily')::uuid,
      date '2026-08-31',
      'medication_0900',
      pg_catalog.gen_random_uuid(),
      null
    );
    raise exception 'NULL prepare timestamp was accepted.';
  exception
    when invalid_parameter_value then null;
  end;

  begin
    perform *
    from public.finalize_reminder_dispatch(
      pg_catalog.current_setting('fixture.reminder_daily')::uuid,
      date '2026-08-31',
      'medication_0900',
      null,
      'sent',
      'daily',
      null,
      null,
      array[]::uuid[],
      timestamptz '2026-08-31 09:00:00+09'
    );
    raise exception 'NULL finalize claim token was accepted.';
  exception
    when invalid_parameter_value then null;
  end;
end;
$fixture$;

do $fixture$
begin
  if public.reminder_dispatch_eligibility(
    pg_catalog.current_setting('fixture.reminder_daily')::uuid,
    date '2026-08-31',
    'medication_0900'
  ) <> 'daily' then
    raise exception 'Partially unrecorded daily user was not eligible at 09:00.';
  end if;

  if public.reminder_dispatch_eligibility(
    pg_catalog.current_setting('fixture.reminder_daily')::uuid,
    date '2026-08-31',
    'daily_1100'
  ) <> 'daily'
    or public.reminder_dispatch_eligibility(
      pg_catalog.current_setting('fixture.reminder_daily')::uuid,
      date '2026-08-31',
      'daily_1300'
    ) <> 'daily' then
    raise exception 'Daily user was not eligible at 11:00 and 13:00.';
  end if;

  if public.reminder_dispatch_eligibility(
    pg_catalog.current_setting('fixture.reminder_all_daily')::uuid,
    date '2026-08-31',
    'medication_0900'
  ) is not null then
    raise exception 'Fully recorded daily user was eligible.';
  end if;

  if public.reminder_dispatch_eligibility(
    pg_catalog.current_setting('fixture.reminder_prn')::uuid,
    date '2026-08-31',
    'medication_0900'
  ) <> 'as_needed' then
    raise exception 'As-needed user was not eligible at 09:00.';
  end if;

  if public.reminder_dispatch_eligibility(
    pg_catalog.current_setting('fixture.reminder_both')::uuid,
    date '2026-08-31',
    'medication_0900'
  ) <> 'daily' then
    raise exception 'Daily did not take priority over as-needed at 09:00.';
  end if;

  if public.reminder_dispatch_eligibility(
    pg_catalog.current_setting('fixture.reminder_bedtime')::uuid,
    date '2026-08-31',
    'bedtime_2100'
  ) <> 'bedtime' then
    raise exception 'Bedtime user was not eligible at 21:00.';
  end if;

  if public.reminder_dispatch_eligibility(
    pg_catalog.current_setting('fixture.reminder_mood')::uuid,
    date '2026-08-31',
    'mood_1500'
  ) <> 'mood' then
    raise exception 'Mood user without a record was not eligible.';
  end if;

  if public.reminder_dispatch_eligibility(
    pg_catalog.current_setting('fixture.reminder_mood_done')::uuid,
    date '2026-08-31',
    'mood_1500'
  ) is not null then
    raise exception 'Mood user with a record was eligible.';
  end if;

  if public.reminder_dispatch_eligibility(
    pg_catalog.current_setting('fixture.reminder_no_med')::uuid,
    date '2026-08-31',
    'medication_0900'
  ) is not null then
    raise exception 'User without medication was eligible.';
  end if;

  if public.reminder_dispatch_eligibility(
    pg_catalog.current_setting('fixture.reminder_med_off')::uuid,
    date '2026-08-31',
    'medication_0900'
  ) is not null then
    raise exception 'medication_enabled=false user was eligible.';
  end if;

  if public.reminder_dispatch_eligibility(
    pg_catalog.current_setting('fixture.reminder_mood_off')::uuid,
    date '2026-08-31',
    'mood_1500'
  ) is not null then
    raise exception 'mood_enabled=false user was eligible.';
  end if;

  if public.reminder_dispatch_eligibility(
    pg_catalog.current_setting('fixture.reminder_revoked')::uuid,
    date '2026-08-31',
    'medication_0900'
  ) is not null then
    raise exception 'Revoked-only user was eligible.';
  end if;

  if public.reminder_dispatch_eligibility(
    pg_catalog.current_setting('fixture.visit_tomorrow')::uuid,
    date '2026-08-31',
    'visit_day_before_0800'
  ) <> 'visit_day_before' then
    raise exception 'Tomorrow visit was not eligible for D-1.';
  end if;

  if public.reminder_dispatch_eligibility(
    pg_catalog.current_setting('fixture.visit_today')::uuid,
    date '2026-08-31',
    'visit_day_today_0800'
  ) <> 'visit_day_today' then
    raise exception 'Today visit was not eligible for D-day.';
  end if;

  if public.reminder_dispatch_eligibility(
    pg_catalog.current_setting('fixture.visit_yesterday')::uuid,
    date '2026-08-31',
    'visit_day_before_0800'
  ) is not null
    or public.reminder_dispatch_eligibility(
      pg_catalog.current_setting('fixture.visit_yesterday')::uuid,
      date '2026-08-31',
      'visit_day_today_0800'
    ) is not null then
    raise exception 'Past visit was eligible for catch-up.';
  end if;

  if public.reminder_dispatch_eligibility(
    pg_catalog.current_setting('fixture.visit_off')::uuid,
    date '2026-08-31',
    'visit_day_before_0800'
  ) is not null then
    raise exception 'visit_day_enabled=false user was eligible.';
  end if;

  if public.reminder_dispatch_eligibility(
    pg_catalog.current_setting('fixture.visit_revoked')::uuid,
    date '2026-08-31',
    'visit_day_before_0800'
  ) is not null then
    raise exception 'Revoked-only visit user was eligible.';
  end if;
end;
$fixture$;

do $fixture$
declare
  v_claim record;
  v_count integer := 0;
begin
  for v_claim in
    select *
    from public.claim_due_reminder_dispatches(
      date '2026-08-31',
      'visit_day_before_0800',
      timestamptz '2026-08-31 08:00:00+09',
      timestamptz '2026-08-31 08:30:00+09',
      20
    )
  loop
    v_count := v_count + 1;
    if v_claim.user_id = pg_catalog.current_setting('fixture.visit_tomorrow')::uuid then
      perform pg_catalog.set_config('fixture.visit_tomorrow_claim', v_claim.claim_token::text, true);
    elsif v_claim.user_id = pg_catalog.current_setting('fixture.visit_changed')::uuid then
      perform pg_catalog.set_config('fixture.visit_changed_claim', v_claim.claim_token::text, true);
    elsif v_claim.user_id = pg_catalog.current_setting('fixture.visit_deleted')::uuid then
      perform pg_catalog.set_config('fixture.visit_deleted_claim', v_claim.claim_token::text, true);
    end if;
  end loop;

  if v_count <> 3 then
    raise exception 'D-1 claim set did not match the three eligible users.';
  end if;

  select pg_catalog.count(*)::integer
  into v_count
  from public.claim_due_reminder_dispatches(
    date '2026-08-31',
    'visit_day_before_0800',
    timestamptz '2026-08-31 08:00:01+09',
    timestamptz '2026-08-31 08:30:00+09',
    20
  );

  if v_count <> 0 then
    raise exception 'Parallel D-1 cron duplicated a same-slot claim.';
  end if;

  if (
    select pg_catalog.count(*)
    from public.reminder_dispatches
    where user_id = pg_catalog.current_setting('fixture.visit_tomorrow')::uuid
      and reminder_date = date '2026-08-31'
      and reminder_slot = 'visit_day_before_0800'
  ) <> 1 then
    raise exception 'Multiple active endpoints duplicated the logical visit dispatch.';
  end if;
end;
$fixture$;

do $fixture$
declare
  v_claim record;
  v_count integer := 0;
begin
  for v_claim in
    select *
    from public.claim_due_reminder_dispatches(
      date '2026-08-31',
      'visit_day_today_0800',
      timestamptz '2026-08-31 08:00:00+09',
      timestamptz '2026-08-31 08:30:00+09',
      20
    )
  loop
    v_count := v_count + 1;
    if v_claim.user_id = pg_catalog.current_setting('fixture.visit_today')::uuid then
      perform pg_catalog.set_config('fixture.visit_today_claim', v_claim.claim_token::text, true);
    end if;
  end loop;

  if v_count <> 1 then
    raise exception 'D-day claim set did not contain exactly the current visit.';
  end if;
end;
$fixture$;

update public.visit_schedules
set
  visit_date = date '2026-09-02',
  updated_at = timestamptz '2026-08-31 08:00:02+09'
where user_id = pg_catalog.current_setting('fixture.visit_changed')::uuid
  and visit_id = 'upcoming';

delete from public.visit_schedules
where user_id = pg_catalog.current_setting('fixture.visit_deleted')::uuid
  and visit_id = 'upcoming';

do $fixture$
declare
  v_count integer;
begin
  select pg_catalog.count(*)::integer
  into v_count
  from public.prepare_reminder_dispatch(
    pg_catalog.current_setting('fixture.visit_changed')::uuid,
    date '2026-08-31',
    'visit_day_before_0800',
    pg_catalog.current_setting('fixture.visit_changed_claim')::uuid,
    timestamptz '2026-08-31 08:00:03+09'
  );
  if v_count <> 0 then
    raise exception 'Changed visit was still prepared for its old date.';
  end if;

  select pg_catalog.count(*)::integer
  into v_count
  from public.prepare_reminder_dispatch(
    pg_catalog.current_setting('fixture.visit_deleted')::uuid,
    date '2026-08-31',
    'visit_day_before_0800',
    pg_catalog.current_setting('fixture.visit_deleted_claim')::uuid,
    timestamptz '2026-08-31 08:00:03+09'
  );
  if v_count <> 0 then
    raise exception 'Deleted visit was still prepared.';
  end if;

  if (
    select pg_catalog.count(*)
    from public.reminder_dispatches
    where user_id in (
      pg_catalog.current_setting('fixture.visit_changed')::uuid,
      pg_catalog.current_setting('fixture.visit_deleted')::uuid
    )
      and status = 'cancelled'
      and last_error_code = 'no_longer_eligible'
  ) <> 2 then
    raise exception 'Changed/deleted visits were not cancelled at final eligibility check.';
  end if;
end;
$fixture$;

do $fixture$
declare
  v_count integer;
  v_kind text;
begin
  select pg_catalog.count(*)::integer, pg_catalog.min(delivery_kind)
  into v_count, v_kind
  from public.prepare_reminder_dispatch(
    pg_catalog.current_setting('fixture.visit_tomorrow')::uuid,
    date '2026-08-31',
    'visit_day_before_0800',
    pg_catalog.current_setting('fixture.visit_tomorrow_claim')::uuid,
    timestamptz '2026-08-31 08:00:03+09'
  );

  if v_count <> 4 or v_kind <> 'visit_day_before' then
    raise exception 'D-1 prepare did not enforce the four-endpoint delivery bound.';
  end if;
end;
$fixture$;

select *
from public.finalize_reminder_dispatch(
  pg_catalog.current_setting('fixture.visit_tomorrow')::uuid,
  date '2026-08-31',
  'visit_day_before_0800',
  pg_catalog.current_setting('fixture.visit_tomorrow_claim')::uuid,
  'sent',
  'visit_day_before',
  null,
  null,
  array[]::uuid[],
  timestamptz '2026-08-31 08:00:04+09'
);

select *
from public.prepare_reminder_dispatch(
  pg_catalog.current_setting('fixture.visit_today')::uuid,
  date '2026-08-31',
  'visit_day_today_0800',
  pg_catalog.current_setting('fixture.visit_today_claim')::uuid,
  timestamptz '2026-08-31 08:00:03+09'
);

select *
from public.finalize_reminder_dispatch(
  pg_catalog.current_setting('fixture.visit_today')::uuid,
  date '2026-08-31',
  'visit_day_today_0800',
  pg_catalog.current_setting('fixture.visit_today_claim')::uuid,
  'sent',
  'visit_day_today',
  null,
  null,
  array[]::uuid[],
  timestamptz '2026-08-31 08:00:04+09'
);

do $fixture$
begin
  if not exists (
    select 1
    from public.app_notifications
    where user_id = pg_catalog.current_setting('fixture.visit_tomorrow')::uuid
      and notification_id = 'reminder:2026-08-31:visit_day_before_0800'
      and kind = 'visit_day'
      and title = '내원일 알림'
      and body = '내일은 병원 방문일이에요.'
      and url = '/visits'
  ) then
    raise exception 'D-1 visit inbox contract was not persisted.';
  end if;

  if not exists (
    select 1
    from public.app_notifications
    where user_id = pg_catalog.current_setting('fixture.visit_today')::uuid
      and notification_id = 'reminder:2026-08-31:visit_day_today_0800'
      and kind = 'visit_day'
      and title = '내원일 알림'
      and body = '오늘은 병원 방문일이에요.'
      and url = '/visits'
  ) then
    raise exception 'D-day visit inbox contract was not persisted.';
  end if;

  begin
    perform *
    from public.claim_due_reminder_dispatches(
      date '2026-08-31',
      'visit_day_today_0800',
      timestamptz '2026-08-31 08:30:00+09',
      timestamptz '2026-08-31 08:30:00+09',
      20
    );
    raise exception '08:30 visit catch-up was accepted.';
  exception
    when invalid_parameter_value then null;
  end;

  begin
    insert into public.visit_schedules (
      user_id, visit_id, visit_date, created_at, updated_at
    ) values (
      pg_catalog.current_setting('fixture.visit_tomorrow')::uuid,
      'another',
      date '2026-09-01',
      pg_catalog.now(),
      pg_catalog.now()
    );
    raise exception 'Current schema unexpectedly accepted multiple visit schedules.';
  exception
    when check_violation then null;
  end;
end;
$fixture$;

do $fixture$
declare
  v_claim record;
begin
  for v_claim in
    select *
    from public.claim_due_reminder_dispatches(
      date '2026-09-01',
      'visit_day_today_0800',
      timestamptz '2026-09-01 08:00:00+09',
      timestamptz '2026-09-01 08:30:00+09',
      20
    )
  loop
    if v_claim.user_id = pg_catalog.current_setting('fixture.visit_tomorrow')::uuid then
      perform pg_catalog.set_config('fixture.visit_tomorrow_day_claim', v_claim.claim_token::text, true);
    end if;
  end loop;

  if pg_catalog.current_setting('fixture.visit_tomorrow_day_claim', true) is null then
    raise exception 'A D-1 recipient was not independently claimable on D-day.';
  end if;
end;
$fixture$;

select *
from public.prepare_reminder_dispatch(
  pg_catalog.current_setting('fixture.visit_tomorrow')::uuid,
  date '2026-09-01',
  'visit_day_today_0800',
  pg_catalog.current_setting('fixture.visit_tomorrow_day_claim')::uuid,
  timestamptz '2026-09-01 08:00:01+09'
);

select *
from public.finalize_reminder_dispatch(
  pg_catalog.current_setting('fixture.visit_tomorrow')::uuid,
  date '2026-09-01',
  'visit_day_today_0800',
  pg_catalog.current_setting('fixture.visit_tomorrow_day_claim')::uuid,
  'sent',
  'visit_day_today',
  null,
  null,
  array[]::uuid[],
  timestamptz '2026-09-01 08:00:02+09'
);

do $fixture$
begin
  if (
    select pg_catalog.count(*)
    from public.reminder_dispatches
    where user_id = pg_catalog.current_setting('fixture.visit_tomorrow')::uuid
      and status = 'sent'
      and reminder_slot in ('visit_day_before_0800', 'visit_day_today_0800')
  ) <> 2 then
    raise exception 'D-1 and D-day did not persist as two independent dispatches.';
  end if;
end;
$fixture$;

with claimed as (
  select *
  from public.claim_due_reminder_dispatches(
    date '2026-08-31',
    'medication_0900',
    timestamptz '2026-08-31 09:00:00+09',
    timestamptz '2026-08-31 09:30:00+09',
    20
  )
)
select pg_catalog.set_config(
  'fixture.reminder_both_claim',
  (
    select claimed.claim_token::text
    from claimed
    where claimed.user_id = pg_catalog.current_setting('fixture.reminder_both')::uuid
  ),
  true
);

do $fixture$
declare
  v_claim_count integer;
begin
  select pg_catalog.count(*)::integer
  into v_claim_count
  from public.claim_due_reminder_dispatches(
    date '2026-08-31',
    'medication_0900',
    timestamptz '2026-08-31 09:00:01+09',
    timestamptz '2026-08-31 09:30:00+09',
    20
  );

  if v_claim_count <> 0 then
    raise exception 'A second cron claimed an already claimed user/date/slot.';
  end if;

  if (
    select pg_catalog.count(*)
    from public.reminder_dispatches
    where user_id = pg_catalog.current_setting('fixture.reminder_both')::uuid
      and reminder_date = date '2026-08-31'
      and reminder_slot = 'medication_0900'
  ) <> 1 then
    raise exception '09:00 daily/as-needed logical group was duplicated.';
  end if;
end;
$fixture$;

update public.reminder_dispatches
set
  status = 'cancelled',
  lease_expires_at = null,
  completed_at = timestamptz '2026-08-31 09:00:02+09',
  last_error_code = 'no_longer_eligible',
  updated_at = timestamptz '2026-08-31 09:00:02+09'
where reminder_date = date '2026-08-31'
  and reminder_slot = 'medication_0900'
  and status = 'processing'
  and user_id <> pg_catalog.current_setting('fixture.reminder_both')::uuid;

do $fixture$
declare
  v_kind text;
  v_count integer;
begin
  select pg_catalog.min(prepared.delivery_kind), pg_catalog.count(*)::integer
  into v_kind, v_count
  from public.prepare_reminder_dispatch(
    pg_catalog.current_setting('fixture.reminder_both')::uuid,
    date '2026-08-31',
    'medication_0900',
    pg_catalog.current_setting('fixture.reminder_both_claim')::uuid,
    timestamptz '2026-08-31 09:00:05+09'
  ) as prepared;

  if v_kind <> 'daily' or v_count <> 1 then
    raise exception '09:00 prepare did not select one daily-priority delivery.';
  end if;
end;
$fixture$;

select *
from public.finalize_reminder_dispatch(
  pg_catalog.current_setting('fixture.reminder_both')::uuid,
  date '2026-08-31',
  'medication_0900',
  pg_catalog.current_setting('fixture.reminder_both_claim')::uuid,
  'retryable_failed',
  'daily',
  429,
  'provider_429',
  array[]::uuid[],
  timestamptz '2026-08-31 09:00:10+09'
);

do $fixture$
begin
  if not exists (
    select 1
    from public.reminder_dispatches
    where user_id = pg_catalog.current_setting('fixture.reminder_both')::uuid
      and status = 'retryable_failed'
      and attempt_count = 1
      and next_attempt_at = timestamptz '2026-08-31 09:05:05+09'
      and last_error_code = 'provider_429'
  ) then
    raise exception 'First retry was not scheduled at first attempt +5 minutes.';
  end if;
end;
$fixture$;

with claimed as (
  select *
  from public.claim_due_reminder_dispatches(
    date '2026-08-31',
    'medication_0900',
    timestamptz '2026-08-31 09:05:05+09',
    timestamptz '2026-08-31 09:30:00+09',
    20
  )
)
select pg_catalog.set_config(
  'fixture.reminder_both_claim',
  (
    select claim_token::text
    from claimed
    where user_id = pg_catalog.current_setting('fixture.reminder_both')::uuid
  ),
  true
);

select *
from public.prepare_reminder_dispatch(
  pg_catalog.current_setting('fixture.reminder_both')::uuid,
  date '2026-08-31',
  'medication_0900',
  pg_catalog.current_setting('fixture.reminder_both_claim')::uuid,
  timestamptz '2026-08-31 09:05:06+09'
);

select *
from public.finalize_reminder_dispatch(
  pg_catalog.current_setting('fixture.reminder_both')::uuid,
  date '2026-08-31',
  'medication_0900',
  pg_catalog.current_setting('fixture.reminder_both_claim')::uuid,
  'retryable_failed',
  'daily',
  503,
  'provider_5xx',
  array[]::uuid[],
  timestamptz '2026-08-31 09:05:07+09'
);

do $fixture$
begin
  if not exists (
    select 1
    from public.reminder_dispatches
    where user_id = pg_catalog.current_setting('fixture.reminder_both')::uuid
      and status = 'retryable_failed'
      and attempt_count = 2
      and next_attempt_at = timestamptz '2026-08-31 09:15:05+09'
      and last_error_code = 'provider_5xx'
  ) then
    raise exception 'Second retry was not scheduled at first attempt +15 minutes.';
  end if;
end;
$fixture$;

with claimed as (
  select *
  from public.claim_due_reminder_dispatches(
    date '2026-08-31',
    'medication_0900',
    timestamptz '2026-08-31 09:15:05+09',
    timestamptz '2026-08-31 09:30:00+09',
    20
  )
)
select pg_catalog.set_config(
  'fixture.reminder_both_claim',
  (
    select claim_token::text
    from claimed
    where user_id = pg_catalog.current_setting('fixture.reminder_both')::uuid
  ),
  true
);

select *
from public.prepare_reminder_dispatch(
  pg_catalog.current_setting('fixture.reminder_both')::uuid,
  date '2026-08-31',
  'medication_0900',
  pg_catalog.current_setting('fixture.reminder_both_claim')::uuid,
  timestamptz '2026-08-31 09:15:06+09'
);

select *
from public.finalize_reminder_dispatch(
  pg_catalog.current_setting('fixture.reminder_both')::uuid,
  date '2026-08-31',
  'medication_0900',
  pg_catalog.current_setting('fixture.reminder_both_claim')::uuid,
  'retryable_failed',
  'daily',
  503,
  'provider_5xx',
  array[]::uuid[],
  timestamptz '2026-08-31 09:15:07+09'
);

do $fixture$
begin
  if not exists (
    select 1
    from public.reminder_dispatches
    where user_id = pg_catalog.current_setting('fixture.reminder_both')::uuid
      and status = 'permanent_failed'
      and attempt_count = 3
      and next_attempt_at is null
      and last_error_code = 'retry_window_exhausted'
  ) then
    raise exception 'Third provider failure did not stop retrying.';
  end if;

  begin
    perform *
    from public.claim_due_reminder_dispatches(
      date '2026-08-30',
      'medication_0900',
      timestamptz '2026-08-31 09:20:00+09',
      timestamptz '2026-08-30 09:30:00+09',
      20
    );
    raise exception 'Previous-date catch-up was accepted.';
  exception
    when invalid_parameter_value then null;
  end;

  begin
    perform *
    from public.claim_due_reminder_dispatches(
      date '2026-08-31',
      'medication_0900',
      timestamptz '2026-08-31 09:30:00+09',
      timestamptz '2026-08-31 09:30:00+09',
      20
    );
    raise exception '30-minute window end was accepted.';
  exception
    when invalid_parameter_value then null;
  end;
end;
$fixture$;

insert into public.user_medications (
  user_id, id, name, strength_value, strength_unit, image_path, registration_method, schedule, active
)
values (
  pg_catalog.current_setting('fixture.reminder_exact')::uuid,
  'exact-daily',
  'fixture',
  1,
  'mg',
  '/fixture.svg',
  'manual',
  'daily',
  true
);

insert into public.push_subscriptions (
  id, user_id, endpoint, p256dh, auth, medication_enabled, mood_enabled
)
values
  (
    pg_catalog.gen_random_uuid(),
    pg_catalog.current_setting('fixture.reminder_exact')::uuid,
    'https://push.example.test/exact-expired',
    pg_catalog.repeat('p', 65),
    pg_catalog.repeat('a', 22),
    true,
    true
  ),
  (
    pg_catalog.gen_random_uuid(),
    pg_catalog.current_setting('fixture.reminder_exact')::uuid,
    'https://push.example.test/exact-active',
    pg_catalog.repeat('q', 65),
    pg_catalog.repeat('b', 22),
    true,
    true
  );

with claimed as (
  select *
  from public.claim_due_reminder_dispatches(
    date '2026-08-31',
    'medication_0900',
    timestamptz '2026-08-31 09:20:00+09',
    timestamptz '2026-08-31 09:30:00+09',
    20
  )
)
select pg_catalog.set_config(
  'fixture.reminder_exact_claim',
  (
    select claim_token::text
    from claimed
    where user_id = pg_catalog.current_setting('fixture.reminder_exact')::uuid
  ),
  true
);

select *
from public.prepare_reminder_dispatch(
  pg_catalog.current_setting('fixture.reminder_exact')::uuid,
  date '2026-08-31',
  'medication_0900',
  pg_catalog.current_setting('fixture.reminder_exact_claim')::uuid,
  timestamptz '2026-08-31 09:20:01+09'
);

select *
from public.finalize_reminder_dispatch(
  pg_catalog.current_setting('fixture.reminder_exact')::uuid,
  date '2026-08-31',
  'medication_0900',
  pg_catalog.current_setting('fixture.reminder_exact_claim')::uuid,
  'sent',
  'daily',
  null,
  null,
  array[
    (
      select id
      from public.push_subscriptions
      where endpoint = 'https://push.example.test/exact-expired'
    )
  ]::uuid[],
  timestamptz '2026-08-31 09:20:02+09'
);

do $fixture$
begin
  if not exists (
    select 1
    from public.push_subscriptions
    where endpoint = 'https://push.example.test/exact-expired'
      and revoked_at = timestamptz '2026-08-31 09:20:02+09'
  ) or not exists (
    select 1
    from public.push_subscriptions
    where endpoint = 'https://push.example.test/exact-active'
      and revoked_at is null
  ) then
    raise exception '404/410 finalization did not revoke only the exact endpoint.';
  end if;

  if not exists (
    select 1
    from public.app_notifications
    where user_id = pg_catalog.current_setting('fixture.reminder_exact')::uuid
      and notification_id = 'reminder:2026-08-31:medication_0900'
      and title = '복용 알림'
      and body = '오늘의 복용 여부를 확인해보세요.'
      and url = '/'
  ) then
    raise exception 'Accepted daily Push did not create the deterministic inbox row.';
  end if;
end;
$fixture$;

with claimed as (
  select *
  from public.claim_due_reminder_dispatches(
    date '2026-08-31',
    'mood_1500',
    timestamptz '2026-08-31 15:00:00+09',
    timestamptz '2026-08-31 15:30:00+09',
    20
  )
)
select pg_catalog.set_config(
  'fixture.reminder_mood_claim',
  (
    select claim_token::text
    from claimed
    where user_id = pg_catalog.current_setting('fixture.reminder_mood')::uuid
  ),
  true
);

select *
from public.prepare_reminder_dispatch(
  pg_catalog.current_setting('fixture.reminder_mood')::uuid,
  date '2026-08-31',
  'mood_1500',
  pg_catalog.current_setting('fixture.reminder_mood_claim')::uuid,
  timestamptz '2026-08-31 15:00:01+09'
);

select *
from public.finalize_reminder_dispatch(
  pg_catalog.current_setting('fixture.reminder_mood')::uuid,
  date '2026-08-31',
  'mood_1500',
  pg_catalog.current_setting('fixture.reminder_mood_claim')::uuid,
  'sent',
  'mood',
  null,
  null,
  array[]::uuid[],
  timestamptz '2026-08-31 15:00:02+09'
);

do $fixture$
begin
  if not exists (
    select 1
    from public.app_notifications
    where user_id = pg_catalog.current_setting('fixture.reminder_mood')::uuid
      and notification_id = 'reminder:2026-08-31:mood_1500'
      and title = '감정기록 알림'
      and body = '오늘의 감정은 어떠셨나요?'
      and url = '/moods/new'
  ) then
    raise exception 'Accepted mood Push did not create the /moods/new inbox row.';
  end if;

  begin
    insert into public.app_notifications (
      user_id, notification_id, kind, title, body, url, fired_at
    ) values (
      pg_catalog.current_setting('fixture.reminder_mood')::uuid,
      'invalid-kind-route',
      'medication',
      'invalid',
      'invalid',
      '/moods/new',
      pg_catalog.now()
    );
    raise exception 'Invalid kind/route pair was accepted.';
  exception
    when check_violation then null;
  end;

  insert into public.app_notifications (
    user_id, notification_id, kind, title, body, url, fired_at
  ) values (
    pg_catalog.current_setting('fixture.reminder_mood')::uuid,
    'legacy-mood-route',
    'mood',
    'legacy',
    'legacy',
    '/moods?tab=report',
    pg_catalog.now()
  );
end;
$fixture$;

with claimed as (
  select *
  from public.claim_due_reminder_dispatches(
    date '2026-09-03',
    'visit_day_today_0800',
    timestamptz '2026-09-03 08:29:58+09',
    timestamptz '2026-09-03 08:30:00+09',
    20
  )
)
select pg_catalog.set_config(
  'fixture.visit_window_claim',
  (
    select claim_token::text
    from claimed
    where user_id = pg_catalog.current_setting('fixture.visit_window')::uuid
  ),
  true
);

select *
from public.prepare_reminder_dispatch(
  pg_catalog.current_setting('fixture.visit_window')::uuid,
  date '2026-09-03',
  'visit_day_today_0800',
  pg_catalog.current_setting('fixture.visit_window_claim')::uuid,
  timestamptz '2026-09-03 08:29:59+09'
);

select *
from public.finalize_reminder_dispatch(
  pg_catalog.current_setting('fixture.visit_window')::uuid,
  date '2026-09-03',
  'visit_day_today_0800',
  pg_catalog.current_setting('fixture.visit_window_claim')::uuid,
  'permanent_failed',
  'visit_day_today',
  null,
  'window_expired_during_send',
  array[]::uuid[],
  timestamptz '2026-09-03 08:30:00+09'
);

do $fixture$
begin
  if not exists (
    select 1
    from public.reminder_dispatches
    where user_id = pg_catalog.current_setting('fixture.visit_window')::uuid
      and reminder_date = date '2026-09-03'
      and reminder_slot = 'visit_day_today_0800'
      and status = 'permanent_failed'
      and last_error_code = 'window_expired_during_send'
  ) then
    raise exception 'Window-expired queued provider delivery was not finalized safely.';
  end if;
end;
$fixture$;

insert into public.reminder_dispatches (
  user_id,
  reminder_date,
  reminder_slot,
  status,
  claim_token,
  claimed_at,
  attempt_count,
  window_expires_at,
  completed_at,
  last_error_code,
  created_at,
  updated_at
)
values (
  pg_catalog.current_setting('fixture.reminder_no_med')::uuid,
  date '2026-07-01',
  'medication_0900',
  'cancelled',
  pg_catalog.gen_random_uuid(),
  timestamptz '2026-07-01 09:00:00+09',
  0,
  timestamptz '2026-07-01 09:30:00+09',
  timestamptz '2026-07-01 09:00:00+09',
  'no_longer_eligible',
  timestamptz '2026-07-01 09:00:00+09',
  timestamptz '2026-07-01 09:00:00+09'
);

select pg_catalog.count(*) as retention_trigger_claim_count
from public.claim_due_reminder_dispatches(
  date '2026-08-31',
  'daily_1100',
  timestamptz '2026-08-31 11:00:00+09',
  timestamptz '2026-08-31 11:30:00+09',
  20
);

do $fixture$
begin
  if exists (
    select 1
    from public.reminder_dispatches
    where user_id = pg_catalog.current_setting('fixture.reminder_no_med')::uuid
      and reminder_date = date '2026-07-01'
  ) then
    raise exception 'Dispatch older than 35 days was not purged.';
  end if;
end;
$fixture$;

reset role;
rollback;
