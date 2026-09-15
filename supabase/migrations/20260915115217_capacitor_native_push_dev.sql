-- Dev-only additive Native FCM storage. Apply only to ADDI Dev in Phase 3.
-- No existing Web subscription, policy, scheduler function, or grant is changed.
create table public.native_push_registrations (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 installation_id uuid not null unique,
 installation_secret_hash text not null check (installation_secret_hash ~ '^[a-f0-9]{64}$'),
 revision bigint not null check (revision > 0),
 binding_id uuid not null,
 fcm_token text not null check (length(fcm_token) between 20 and 4096),
 token_hash text generated always as (encode(extensions.digest(fcm_token, 'sha256'), 'hex')) stored,
 medication_enabled boolean not null default false,
 visit_day_enabled boolean not null default false,
 mood_enabled boolean not null default false,
 app_version text not null check (length(app_version) between 1 and 80),
 token_updated_at timestamptz not null default now(),
 last_seen_at timestamptz not null default now(),
 revoked_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index native_push_active_token_idx on public.native_push_registrations(token_hash) where revoked_at is null;
create index native_push_owner_active_idx on public.native_push_registrations(user_id) where revoked_at is null;
alter table public.native_push_registrations enable row level security;
alter table public.native_push_registrations force row level security;
revoke all on public.native_push_registrations from public, anon, authenticated;
grant select, insert, update, delete on public.native_push_registrations to service_role;
comment on table public.native_push_registrations is 'Server-only FCM credentials. Edge API validates Supabase bearer owner; installation capability only permits bounded maintenance/revocation. Never log tokens.';

-- One explicit Dev QA target, set only by an administrator after selecting the Galaxy installation.
create table public.native_push_qa_target (
 singleton boolean primary key default true check(singleton),
 registration_id uuid not null references public.native_push_registrations(id) on delete cascade,
 expires_at timestamptz not null,
 created_at timestamptz not null default now()
);
alter table public.native_push_qa_target enable row level security;
alter table public.native_push_qa_target force row level security;
revoke all on public.native_push_qa_target from public,anon,authenticated;
grant all on public.native_push_qa_target to service_role;

create table public.native_push_test_runs (
 id uuid primary key,
 registration_id uuid not null references public.native_push_registrations(id) on delete cascade,
 kind text not null check(kind in ('daily','mood','visit_day_today')),
 status text not null check(status in ('processing','sent','failed','unknown')),
 created_at timestamptz not null default now(),
 completed_at timestamptz,
 error_code text
);
alter table public.native_push_test_runs enable row level security;
alter table public.native_push_test_runs force row level security;
revoke all on public.native_push_test_runs from public,anon,authenticated;
grant all on public.native_push_test_runs to service_role;

-- Atomic monotonic registration: a delayed request cannot undo logout/account switch.
-- p_user_id is derived from a verified JWT by the server, never copied from request JSON.

create table public.native_push_revocations (
 installation_id uuid primary key, secret_hash text not null check(secret_hash ~ '^[a-f0-9]{64}$'),
 revision bigint not null check(revision>0), updated_at timestamptz not null default now()
);
alter table public.native_push_revocations enable row level security;
alter table public.native_push_revocations force row level security;
revoke all on public.native_push_revocations from public,anon,authenticated;
grant all on public.native_push_revocations to service_role;


create function public.register_native_push(p_user_id uuid,p_installation_id uuid,p_secret_hash text,p_revision bigint,p_binding_id uuid,p_token text,p_app_version text,p_preferences jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare r public.native_push_registrations%rowtype; v_id uuid; tomb public.native_push_revocations%rowtype;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_installation_id::text,0));
 select * into tomb from public.native_push_revocations where installation_id=p_installation_id;
 if found and (tomb.secret_hash<>p_secret_hash or p_revision<=tomb.revision) then raise exception 'native_registration_conflict' using errcode='42501';end if;
 select * into r from public.native_push_registrations where installation_id=p_installation_id for update;
 if found then
  if r.installation_secret_hash<>p_secret_hash or p_revision<r.revision
    or (p_revision=r.revision and (r.user_id<>p_user_id or r.binding_id<>p_binding_id or r.revoked_at is not null or r.fcm_token<>p_token or r.medication_enabled is distinct from (p_preferences->>'medication')::boolean or r.visit_day_enabled is distinct from (p_preferences->>'visit_day')::boolean or r.mood_enabled is distinct from (p_preferences->>'mood')::boolean)) then
   raise exception 'native_registration_conflict' using errcode='42501';
  end if;
  if r.user_id<>p_user_id and p_preferences<>'{"medication":false,"visit_day":false,"mood":false}'::jsonb then raise exception 'new_owner_consent_required' using errcode='42501';end if;
 end if;
 insert into public.native_push_registrations as n(user_id,installation_id,installation_secret_hash,revision,binding_id,fcm_token,app_version,medication_enabled,visit_day_enabled,mood_enabled)
 values(p_user_id,p_installation_id,p_secret_hash,p_revision,p_binding_id,p_token,p_app_version,
  (p_preferences->>'medication')::boolean,(p_preferences->>'visit_day')::boolean,(p_preferences->>'mood')::boolean)
 on conflict(installation_id) do update set
  user_id=excluded.user_id,revision=excluded.revision,binding_id=excluded.binding_id,fcm_token=excluded.fcm_token,
  app_version=excluded.app_version,medication_enabled=excluded.medication_enabled,visit_day_enabled=excluded.visit_day_enabled,mood_enabled=excluded.mood_enabled,
  token_updated_at=case when n.fcm_token<>excluded.fcm_token then now() else n.token_updated_at end,
  last_seen_at=now(),updated_at=now(),revoked_at=null
 returning id into v_id;
 return v_id;
end $$;

create function public.revoke_native_push(p_installation_id uuid,p_secret_hash text,p_revision bigint)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_installation_id::text,0));
 if not exists(select 1 from public.native_push_registrations where installation_id=p_installation_id and installation_secret_hash=p_secret_hash) then return false;end if;
 insert into public.native_push_revocations as t(installation_id,secret_hash,revision) values(p_installation_id,p_secret_hash,p_revision)
 on conflict(installation_id) do update set revision=greatest(t.revision,excluded.revision),updated_at=now() where t.secret_hash=excluded.secret_hash;
 update public.native_push_registrations set revoked_at=now(),updated_at=now(),revision=p_revision,
 medication_enabled=false,visit_day_enabled=false,mood_enabled=false
 where installation_id=p_installation_id and installation_secret_hash=p_secret_hash and revision<=p_revision;
 return found;
end $$;

-- Background token rotation cannot change owner, binding or preferences.
create function public.rotate_native_push(p_installation_id uuid,p_secret_hash text,p_revision bigint,p_binding_id uuid,p_token text)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_installation_id::text,0));
 update public.native_push_registrations set fcm_token=p_token,revision=p_revision,token_updated_at=now(),updated_at=now(),last_seen_at=now()
 where installation_id=p_installation_id and installation_secret_hash=p_secret_hash and revision<=p_revision and binding_id=p_binding_id and revoked_at is null;
 return found;
end $$;

revoke all on function public.register_native_push(uuid,uuid,text,bigint,uuid,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.revoke_native_push(uuid,text,bigint) from public,anon,authenticated;
revoke all on function public.rotate_native_push(uuid,text,bigint,uuid,text) from public,anon,authenticated;
grant execute on function public.register_native_push(uuid,uuid,text,bigint,uuid,text,text,jsonb) to service_role;
grant execute on function public.revoke_native_push(uuid,text,bigint) to service_role;
grant execute on function public.rotate_native_push(uuid,text,bigint,uuid,text) to service_role;
create table public.reminder_deliveries (
 user_id uuid not null,
 reminder_date date not null,
 reminder_slot text not null,
 transport text not null check(transport in ('web','fcm')),
 target_id uuid not null,
 binding_id uuid,
 token_hash text,
 claim_token uuid,
 status text not null default 'pending' check(status in ('pending','processing','sent','retryable_failed','permanent_failed','cancelled')),
 attempt_count smallint not null default 0 check(attempt_count between 0 and 3),
 first_attempt_at timestamptz, next_attempt_at timestamptz, completed_at timestamptz,
 http_status integer check(http_status between 100 and 599),
 error_code text check(error_code in ('provider_429','provider_5xx','provider_4xx','unregistered','provider_outcome_unknown','target_disabled','window_expired')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 primary key(user_id,reminder_date,reminder_slot,transport,target_id),
 foreign key(user_id,reminder_date,reminder_slot) references public.reminder_dispatches on delete cascade
);
create index reminder_deliveries_due_idx on public.reminder_deliveries(next_attempt_at) where status='retryable_failed';
alter table public.reminder_deliveries enable row level security;
alter table public.reminder_deliveries force row level security;
revoke all on public.reminder_deliveries from public,anon,authenticated;
grant all on public.reminder_deliveries to service_role;
comment on table public.reminder_deliveries is 'Per-transport target outcomes under the existing user/date/slot logical claim. No raw endpoints, tokens, provider errors or health content.';
create or replace function public.reminder_dispatch_eligibility_v2(
  p_user_id uuid,
  p_reminder_date date,
  p_reminder_slot text
)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  with subscription_state as (
    select
      coalesce(pg_catalog.bool_or(subscription.medication_enabled), false)
        as medication_enabled,
      coalesce(pg_catalog.bool_or(subscription.mood_enabled), false)
        as mood_enabled,
      coalesce(pg_catalog.bool_or(subscription.visit_day_enabled), false)
        as visit_day_enabled
    from (
      select user_id,revoked_at,medication_enabled,mood_enabled,visit_day_enabled from public.push_subscriptions
      union all
      select user_id,revoked_at,medication_enabled,mood_enabled,visit_day_enabled from public.native_push_registrations
    ) as subscription
    where subscription.user_id = p_user_id
      and subscription.revoked_at is null
  ),
  medication_state as (
    select
      coalesce(pg_catalog.bool_or(
        medication.schedule = 'daily'
        and not exists (
          select 1
          from public.medication_intake_records as intake
          where intake.user_id = medication.user_id
            and intake.medication_id = medication.id
            and intake.intake_date = p_reminder_date
        )
      ), false) as has_unrecorded_daily,
      coalesce(pg_catalog.bool_or(
        medication.schedule = 'as-needed'
      ), false) as has_as_needed,
      coalesce(pg_catalog.bool_or(
        medication.schedule = 'bedtime'
        and not exists (
          select 1
          from public.medication_intake_records as intake
          where intake.user_id = medication.user_id
            and intake.medication_id = medication.id
            and intake.intake_date = p_reminder_date
        )
      ), false) as has_unrecorded_bedtime
    from public.user_medications as medication
    where medication.user_id = p_user_id
      and medication.active = true
  )
  select case
    when p_reminder_slot = 'visit_day_before_0800'
      and subscription_state.visit_day_enabled
      and exists (
        select 1
        from public.visit_schedules as visit
        where visit.user_id = p_user_id
          and visit.visit_date = p_reminder_date + 1
      )
      then 'visit_day_before'
    when p_reminder_slot = 'visit_day_today_0800'
      and subscription_state.visit_day_enabled
      and exists (
        select 1
        from public.visit_schedules as visit
        where visit.user_id = p_user_id
          and visit.visit_date = p_reminder_date
      )
      then 'visit_day_today'
    when p_reminder_slot = 'medication_0900'
      and subscription_state.medication_enabled
      and medication_state.has_unrecorded_daily
      then 'daily'
    when p_reminder_slot = 'medication_0900'
      and subscription_state.medication_enabled
      and medication_state.has_as_needed
      then 'as_needed'
    when p_reminder_slot in ('daily_1100', 'daily_1300')
      and subscription_state.medication_enabled
      and medication_state.has_unrecorded_daily
      then 'daily'
    when p_reminder_slot = 'bedtime_2100'
      and subscription_state.medication_enabled
      and medication_state.has_unrecorded_bedtime
      then 'bedtime'
    when p_reminder_slot = 'mood_1500'
      and subscription_state.mood_enabled
      and not exists (
        select 1
        from public.mood_records as mood
        where mood.user_id = p_user_id
          and mood.mood_date = p_reminder_date
      )
      then 'mood'
  end
  from subscription_state
  cross join medication_state;
$$;

create or replace function public.claim_due_reminder_dispatches_v2(
  p_reminder_date date,
  p_reminder_slot text,
  p_now timestamptz,
  p_window_expires_at timestamptz,
  p_batch_limit integer default 20,
  p_only_user_id uuid default null
)
returns table (
  user_id uuid,
  reminder_date date,
  reminder_slot text,
  claim_token uuid,
  attempt_count smallint
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_window_started_at timestamptz;
begin
  if p_batch_limit is null or p_batch_limit < 1 or p_batch_limit > 200 then
    raise exception 'Invalid reminder batch limit.' using errcode = '22023';
  end if;

  if p_reminder_date is null
    or p_reminder_slot is null
    or p_now is null
    or p_window_expires_at is null then
    raise exception 'Reminder invocation parameters are required.' using errcode = '22023';
  end if;

  v_window_started_at := public.reminder_slot_started_at(
    p_reminder_date,
    p_reminder_slot
  );

  if v_window_started_at is null
    or p_window_expires_at is distinct from v_window_started_at + interval '30 minutes'
    or p_reminder_date is distinct from pg_catalog.timezone('Asia/Seoul', p_now)::date
    or p_now < v_window_started_at
    or p_now >= p_window_expires_at then
    raise exception 'Reminder invocation is outside its current KST window.'
      using errcode = '22023';
  end if;

  update public.reminder_deliveries as target
  set status='permanent_failed',error_code='provider_outcome_unknown',completed_at=p_now,updated_at=p_now
  from public.reminder_dispatches as parent
  where target.user_id=parent.user_id and target.reminder_date=parent.reminder_date and target.reminder_slot=parent.reminder_slot
    and (p_only_user_id is null or target.user_id=p_only_user_id) and target.status='processing' and parent.lease_expires_at<=p_now;

  with expired_dispatches as (
    select
      dispatch.user_id,
      dispatch.reminder_date,
      dispatch.reminder_slot
    from public.reminder_dispatches as dispatch
    where (p_only_user_id is null or dispatch.user_id=p_only_user_id) and dispatch.created_at < p_now - interval '35 days'
    order by dispatch.created_at
    for update skip locked
    limit 1000
  )
  delete from public.reminder_dispatches as dispatch
  using expired_dispatches as expired
  where (p_only_user_id is null or dispatch.user_id=p_only_user_id) and dispatch.user_id = expired.user_id
    and dispatch.reminder_date = expired.reminder_date
    and dispatch.reminder_slot = expired.reminder_slot;

  update public.reminder_dispatches as dispatch
  set
    status = case
      when dispatch.send_started_at is null then 'cancelled'
      else 'permanent_failed'
    end,
    lease_expires_at = null,
    send_started_at = case
      when dispatch.send_started_at is null then null
      else dispatch.send_started_at
    end,
    next_attempt_at = null,
    completed_at = p_now,
    last_http_status = null,
    last_error_code = case
      when dispatch.send_started_at is null then 'window_expired_before_send'
      else 'provider_outcome_unknown'
    end,
    updated_at = p_now
  where (p_only_user_id is null or dispatch.user_id=p_only_user_id) and dispatch.status = 'processing'
    and dispatch.window_expires_at <= p_now;

  update public.reminder_dispatches as dispatch
  set
    status = 'permanent_failed',
    lease_expires_at = null,
    next_attempt_at = null,
    completed_at = p_now,
    last_http_status = null,
    last_error_code = 'retry_window_exhausted',
    updated_at = p_now
  where (p_only_user_id is null or dispatch.user_id=p_only_user_id) and dispatch.status = 'retryable_failed'
    and dispatch.window_expires_at <= p_now;

  update public.reminder_dispatches as dispatch
  set
    status = 'permanent_failed',
    lease_expires_at = null,
    next_attempt_at = null,
    completed_at = p_now,
    last_http_status = null,
    last_error_code = 'provider_outcome_unknown',
    updated_at = p_now
  where (p_only_user_id is null or dispatch.user_id=p_only_user_id) and dispatch.status = 'processing'
    and dispatch.send_started_at is not null
    and dispatch.lease_expires_at <= p_now;

  update public.reminder_dispatches as dispatch
  set
    status = 'cancelled',
    lease_expires_at = null,
    send_started_at = null,
    next_attempt_at = null,
    completed_at = p_now,
    last_http_status = null,
    last_error_code = 'no_longer_eligible',
    updated_at = p_now
  where (p_only_user_id is null or dispatch.user_id=p_only_user_id) and dispatch.reminder_date = p_reminder_date
    and dispatch.reminder_slot = p_reminder_slot
    and (
      (
        dispatch.status = 'retryable_failed'
        and dispatch.next_attempt_at <= p_now
      )
      or (
        dispatch.status = 'processing'
        and dispatch.send_started_at is null
        and dispatch.lease_expires_at <= p_now
      )
    )
    and public.reminder_dispatch_eligibility_v2(
      dispatch.user_id,
      dispatch.reminder_date,
      dispatch.reminder_slot
    ) is null;

  return query
  with candidates as (
    select medication.user_id
    from public.user_medications as medication
    where medication.active = true
      and (
        (p_reminder_slot = 'medication_0900' and medication.schedule in ('daily', 'as-needed'))
        or (p_reminder_slot in ('daily_1100', 'daily_1300') and medication.schedule = 'daily')
        or (p_reminder_slot = 'bedtime_2100' and medication.schedule = 'bedtime')
      )
    union
    select visit.user_id
    from public.visit_schedules as visit
    where (
      p_reminder_slot = 'visit_day_before_0800'
      and visit.visit_date = p_reminder_date + 1
    ) or (
      p_reminder_slot = 'visit_day_today_0800'
      and visit.visit_date = p_reminder_date
    )
    union
    select subscription.user_id
    from public.push_subscriptions as subscription
    where p_reminder_slot = 'mood_1500'
      and subscription.revoked_at is null
      and subscription.mood_enabled = true
    union
    select registration.user_id from public.native_push_registrations as registration
    where p_reminder_slot='mood_1500' and registration.revoked_at is null and registration.mood_enabled
  ),
  eligible as (
    select candidate.user_id
    from candidates as candidate
    where (p_only_user_id is null or candidate.user_id=p_only_user_id)
      and public.reminder_dispatch_eligibility_v2(
      candidate.user_id,
      p_reminder_date,
      p_reminder_slot
    ) is not null
      and not exists (
        select 1
        from public.reminder_dispatches as existing
        where existing.user_id = candidate.user_id
          and existing.reminder_date = p_reminder_date
          and existing.reminder_slot = p_reminder_slot
          and not (
            (
              existing.status = 'retryable_failed'
              and existing.next_attempt_at <= p_now
              and p_now < existing.window_expires_at
            )
            or (
              existing.status = 'processing'
              and existing.send_started_at is null
              and existing.lease_expires_at <= p_now
              and p_now < existing.window_expires_at
            )
          )
      )
    order by candidate.user_id
    limit p_batch_limit
  ),
  claimed as (
    insert into public.reminder_dispatches as dispatch (
      user_id,
      reminder_date,
      reminder_slot,
      status,
      claim_token,
      claimed_at,
      lease_expires_at,
      attempt_count,
      window_expires_at,
      created_at,
      updated_at
    )
    select
      eligible.user_id,
      p_reminder_date,
      p_reminder_slot,
      'processing',
      pg_catalog.gen_random_uuid(),
      p_now,
      p_now + interval '2 minutes',
      0,
      p_window_expires_at,
      p_now,
      p_now
    from eligible
    on conflict on constraint reminder_dispatches_pkey do update
    set
      status = 'processing',
      delivery_kind = dispatch.delivery_kind,
      claim_token = excluded.claim_token,
      claimed_at = excluded.claimed_at,
      lease_expires_at = excluded.lease_expires_at,
      send_started_at = null,
      next_attempt_at = null,
      completed_at = null,
      last_http_status = null,
      last_error_code = null,
      updated_at = excluded.updated_at
    where (
      dispatch.status = 'retryable_failed'
      and dispatch.next_attempt_at <= p_now
      and p_now < dispatch.window_expires_at
    )
    or (
      dispatch.status = 'processing'
      and dispatch.send_started_at is null
      and dispatch.lease_expires_at <= p_now
      and p_now < dispatch.window_expires_at
    )
    returning
      dispatch.user_id,
      dispatch.reminder_date,
      dispatch.reminder_slot,
      dispatch.claim_token,
      dispatch.attempt_count
  )
  select
    claimed.user_id,
    claimed.reminder_date,
    claimed.reminder_slot,
    claimed.claim_token,
    claimed.attempt_count
  from claimed;
end;
$$;


create function public.reminder_targets_v2(p_user_id uuid,p_kind text)
returns table(transport text,target_id uuid,binding_id uuid,token_hash text,credentials jsonb)
language sql stable security invoker set search_path='' as $$
 (select 'web',w.id,null::uuid,null::text,jsonb_build_object('endpoint',w.endpoint,'keys',jsonb_build_object('p256dh',w.p256dh,'auth',w.auth))
  from public.push_subscriptions w where w.user_id=p_user_id and w.revoked_at is null
   and case when p_kind='mood' then w.mood_enabled when p_kind in ('visit_day_before','visit_day_today') then w.visit_day_enabled else w.medication_enabled end
  order by w.updated_at desc,w.id limit 4)
 union all
 (select 'fcm',n.id,n.binding_id,n.token_hash,jsonb_build_object('token',n.fcm_token,'installationId',n.installation_id,'bindingId',n.binding_id)
  from public.native_push_registrations n where n.user_id=p_user_id and n.revoked_at is null
   and case when p_kind='mood' then n.mood_enabled when p_kind in ('visit_day_before','visit_day_today') then n.visit_day_enabled else n.medication_enabled end
  order by n.updated_at desc,n.id limit 4);
$$;

create function public.prepare_reminder_dispatch_v2(p_user_id uuid,p_reminder_date date,p_reminder_slot text,p_claim_token uuid,p_now timestamptz)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.reminder_dispatches%rowtype; v_kind text; v_targets jsonb;
begin
 select * into r from public.reminder_dispatches where user_id=p_user_id and reminder_date=p_reminder_date and reminder_slot=p_reminder_slot for update;
 if not found or r.status<>'processing' or r.claim_token<>p_claim_token or r.send_started_at is not null or r.lease_expires_at<=p_now or r.window_expires_at<=p_now or r.attempt_count>=3 then return null; end if;
 v_kind:=public.reminder_dispatch_eligibility_v2(p_user_id,p_reminder_date,p_reminder_slot);
 if v_kind is null and r.delivery_kind is null then
  update public.reminder_dispatches set status='cancelled',completed_at=p_now,lease_expires_at=null,last_error_code='no_longer_eligible',updated_at=p_now
  where user_id=p_user_id and reminder_date=p_reminder_date and reminder_slot=p_reminder_slot;
  return null;
 end if;
 -- Freeze the logical kind after the first send; changed eligibility cancels unsent targets.
 if r.delivery_kind is not null and v_kind is distinct from r.delivery_kind then v_kind:=null; end if;
 if r.attempt_count=0 and v_kind is not null then
  insert into public.reminder_deliveries(user_id,reminder_date,reminder_slot,transport,target_id,binding_id,token_hash)
   select p_user_id,p_reminder_date,p_reminder_slot,t.transport,t.target_id,t.binding_id,t.token_hash from public.reminder_targets_v2(p_user_id,v_kind) t
   on conflict do nothing;
 end if;
 update public.reminder_deliveries d set status='cancelled',error_code='target_disabled',completed_at=p_now,updated_at=p_now,next_attempt_at=null
 where d.user_id=p_user_id and d.reminder_date=p_reminder_date and d.reminder_slot=p_reminder_slot and d.status in ('pending','retryable_failed')
 and (v_kind is null or not exists(select 1 from public.reminder_targets_v2(p_user_id,v_kind) t where t.transport=d.transport and t.target_id=d.target_id and t.binding_id is not distinct from d.binding_id));
 update public.reminder_dispatches set delivery_kind=coalesce(r.delivery_kind,v_kind),send_started_at=p_now,first_attempt_at=coalesce(first_attempt_at,p_now),attempt_count=attempt_count+1,
 lease_expires_at=least(window_expires_at,p_now+interval '5 minutes'),updated_at=p_now
 where user_id=p_user_id and reminder_date=p_reminder_date and reminder_slot=p_reminder_slot;
 update public.reminder_deliveries d set status='processing',claim_token=p_claim_token,attempt_count=d.attempt_count+1,
 first_attempt_at=coalesce(d.first_attempt_at,p_now),next_attempt_at=null,updated_at=p_now,token_hash=t.token_hash
 from public.reminder_targets_v2(p_user_id,v_kind) t
 where d.user_id=p_user_id and d.reminder_date=p_reminder_date and d.reminder_slot=p_reminder_slot and d.transport=t.transport and d.target_id=t.target_id
 and d.binding_id is not distinct from t.binding_id and d.attempt_count<3
 and (d.status='pending' or (d.status='retryable_failed' and d.next_attempt_at<=p_now));
 select coalesce(jsonb_agg(jsonb_build_object('transport',d.transport,'targetId',d.target_id,'credentials',t.credentials)), '[]'::jsonb) into v_targets
 from public.reminder_deliveries d join public.reminder_targets_v2(p_user_id,v_kind) t on d.transport=t.transport and d.target_id=t.target_id
 where d.user_id=p_user_id and d.reminder_date=p_reminder_date and d.reminder_slot=p_reminder_slot and d.status='processing' and d.claim_token=p_claim_token;
 return jsonb_build_object('kind',coalesce(r.delivery_kind,v_kind),'targets',v_targets);
end $$;

create function public.finish_reminder_target_v2(p_user_id uuid,p_date date,p_slot text,p_claim uuid,p_transport text,p_target uuid,p_outcome text,p_http integer,p_error text,p_now timestamptz)
returns boolean language plpgsql security invoker set search_path='' as $$
declare d public.reminder_deliveries%rowtype; r public.reminder_dispatches%rowtype; retry_at timestamptz; outcome text:=p_outcome; v_title text; v_body text; v_url text; v_notification_kind text;
begin
 select * into r from public.reminder_dispatches where user_id=p_user_id and reminder_date=p_date and reminder_slot=p_slot for update;
 if not found or r.claim_token<>p_claim or r.status<>'processing' then return false; end if;
 select * into d from public.reminder_deliveries where user_id=p_user_id and reminder_date=p_date and reminder_slot=p_slot and transport=p_transport and target_id=p_target for update;
 if not found or d.status<>'processing' or d.claim_token<>p_claim then return false; end if;
 if p_outcome is null or p_outcome not in ('sent','retryable_failed','permanent_failed','cancelled') then raise exception 'invalid_delivery_outcome'; end if;
 if p_outcome='sent' and (p_http is not null or p_error is not null) then raise exception 'invalid_sent_outcome'; end if;
 if p_outcome='retryable_failed' then
  if not coalesce(((p_http=429 and p_error='provider_429') or (p_http between 500 and 599 and p_error='provider_5xx')),false) then raise exception 'invalid_retry'; end if;
  retry_at:=r.first_attempt_at+case d.attempt_count when 1 then interval '5 minutes' when 2 then interval '15 minutes' else interval '1 day' end;
  if d.attempt_count>=3 or retry_at>=r.window_expires_at or p_now>=r.window_expires_at then outcome:='permanent_failed';retry_at:=null;end if;
 end if;
 update public.reminder_deliveries set status=outcome,http_status=p_http,error_code=p_error,next_attempt_at=retry_at,
 completed_at=case when outcome='retryable_failed' then null else p_now end,updated_at=p_now
 where user_id=p_user_id and reminder_date=p_date and reminder_slot=p_slot and transport=p_transport and target_id=p_target;
 if outcome='sent' then
    if r.delivery_kind = 'visit_day_before' then
      v_title := '내원일 알림';
      v_body := '내일은 병원 방문일이에요.';
      v_url := '/visits';
      v_notification_kind := 'visit_day';
    elsif r.delivery_kind = 'visit_day_today' then
      v_title := '내원일 알림';
      v_body := '오늘은 병원 방문일이에요.';
      v_url := '/visits';
      v_notification_kind := 'visit_day';
    elsif r.delivery_kind = 'daily' then
      v_title := '복용 알림';
      v_body := '오늘의 복용 여부를 확인해보세요.';
      v_url := '/';
      v_notification_kind := 'medication';
    elsif r.delivery_kind = 'as_needed' then
      v_title := '복용 알림';
      v_body := '오늘 중요한 일정이 있다면 복용 계획을 확인해보세요.';
      v_url := '/';
      v_notification_kind := 'medication';
    elsif r.delivery_kind = 'bedtime' then
      v_title := '복용 알림';
      v_body := '자기 전 평소 복용 계획을 확인해보세요.';
      v_url := '/';
      v_notification_kind := 'medication';
    else
      v_title := '감정기록 알림';
      v_body := '오늘의 감정은 어떠셨나요?';
      v_url := '/moods/new';
      v_notification_kind := 'mood';
    end if;

    insert into public.app_notifications (
      user_id,
      notification_id,
      kind,
      title,
      body,
      url,
      fired_at
    ) values (
      p_user_id,
      'reminder:' || p_date::text || ':' || p_slot,
      v_notification_kind,
      v_title,
      v_body,
      v_url,
      p_now
    )
    on conflict (user_id, notification_id) do nothing;

 end if;
 if p_error='unregistered' then
  if p_transport='fcm' then
   update public.native_push_registrations set revoked_at=p_now,updated_at=p_now where id=p_target and user_id=p_user_id and token_hash=d.token_hash and binding_id=d.binding_id;
  elsif p_http in (404,410) then
   update public.push_subscriptions set revoked_at=p_now,updated_at=p_now where id=p_target and user_id=p_user_id;
  end if;
 end if;
 return true;
end $$;

create function public.finalize_reminder_dispatch_v2(p_user_id uuid,p_date date,p_slot text,p_claim uuid,p_now timestamptz)
returns text language plpgsql security invoker set search_path='' as $$
declare r public.reminder_dispatches%rowtype; outcome text; code text; http integer; result text;
begin
 select * into r from public.reminder_dispatches where user_id=p_user_id and reminder_date=p_date and reminder_slot=p_slot for update;
 if not found or r.status<>'processing' or r.claim_token<>p_claim or r.send_started_at is null then return null; end if;
 if exists(select 1 from public.reminder_deliveries where user_id=p_user_id and reminder_date=p_date and reminder_slot=p_slot and status='processing') then raise exception 'unfinished_targets';end if;
 if exists(select 1 from public.reminder_deliveries where user_id=p_user_id and reminder_date=p_date and reminder_slot=p_slot and status='retryable_failed') then
  outcome:='retryable_failed';http:=503;code:='provider_5xx';
 elsif exists(select 1 from public.reminder_deliveries where user_id=p_user_id and reminder_date=p_date and reminder_slot=p_slot and status='sent') then
  outcome:='sent';
 elsif exists(select 1 from public.reminder_deliveries where user_id=p_user_id and reminder_date=p_date and reminder_slot=p_slot and status='permanent_failed') then
  outcome:='permanent_failed';code:='provider_outcome_unknown';
 else outcome:='cancelled';code:='window_expired_before_send';end if;
 select final_status into result from public.finalize_reminder_dispatch(p_user_id,p_date,p_slot,p_claim,outcome,r.delivery_kind,http,code,array[]::uuid[],p_now);
 return result;
end $$;

revoke all on function public.reminder_dispatch_eligibility_v2(uuid,date,text) from public,anon,authenticated;
grant execute on function public.reminder_dispatch_eligibility_v2(uuid,date,text) to service_role;

revoke all on function public.claim_due_reminder_dispatches_v2(date,text,timestamptz,timestamptz,integer,uuid) from public,anon,authenticated;
grant execute on function public.claim_due_reminder_dispatches_v2(date,text,timestamptz,timestamptz,integer,uuid) to service_role;

revoke all on function public.reminder_targets_v2(uuid,text) from public,anon,authenticated;
grant execute on function public.reminder_targets_v2(uuid,text) to service_role;

revoke all on function public.prepare_reminder_dispatch_v2(uuid,date,text,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.prepare_reminder_dispatch_v2(uuid,date,text,uuid,timestamptz) to service_role;

revoke all on function public.finish_reminder_target_v2(uuid,date,text,uuid,text,uuid,text,integer,text,timestamptz) from public,anon,authenticated;
grant execute on function public.finish_reminder_target_v2(uuid,date,text,uuid,text,uuid,text,integer,text,timestamptz) to service_role;

revoke all on function public.finalize_reminder_dispatch_v2(uuid,date,text,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.finalize_reminder_dispatch_v2(uuid,date,text,uuid,timestamptz) to service_role;

create function public.claim_native_push_test(p_id uuid,p_registration uuid,p_kind text)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_registration::text,1));
 if not exists(select 1 from public.native_push_qa_target where singleton and registration_id=p_registration and expires_at>now()) then return false;end if;
 if exists(select 1 from public.native_push_test_runs where registration_id=p_registration and created_at>now()-interval '30 seconds') then return false;end if;
 insert into public.native_push_test_runs(id,registration_id,kind,status) values(p_id,p_registration,p_kind,'processing') on conflict do nothing;
 return found;
end $$;
revoke all on function public.claim_native_push_test(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_native_push_test(uuid,uuid,text) to service_role;
