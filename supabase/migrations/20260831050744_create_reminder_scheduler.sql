-- Production reminder scheduler storage and service-role-only RPCs.
-- The application kill switch is checked before any of these functions are called.

alter table public.app_notifications
  drop constraint if exists app_notifications_target_url_check;

alter table public.app_notifications
  add constraint app_notifications_target_url_check
  check (
    (kind = 'medication' and url = '/')
    or (kind = 'visit_day' and url = '/visits')
    or (kind = 'mood' and url in ('/moods?tab=report', '/moods/new'))
  )
  not valid;

alter table public.app_notifications
  validate constraint app_notifications_target_url_check;

create table public.reminder_dispatches (
  user_id uuid not null references auth.users(id) on delete cascade,
  reminder_date date not null,
  reminder_slot text not null,
  status text not null,
  delivery_kind text,
  claim_token uuid not null,
  claimed_at timestamptz not null,
  lease_expires_at timestamptz,
  send_started_at timestamptz,
  first_attempt_at timestamptz,
  attempt_count smallint not null default 0,
  next_attempt_at timestamptz,
  window_expires_at timestamptz not null,
  sent_at timestamptz,
  completed_at timestamptz,
  last_http_status integer,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, reminder_date, reminder_slot),
  constraint reminder_dispatches_slot_check check (
    reminder_slot in (
      'visit_day_before_0800',
      'visit_day_today_0800',
      'medication_0900',
      'daily_1100',
      'daily_1300',
      'mood_1500',
      'bedtime_2100'
    )
  ),
  constraint reminder_dispatches_status_check check (
    status in (
      'processing',
      'sent',
      'retryable_failed',
      'permanent_failed',
      'cancelled'
    )
  ),
  constraint reminder_dispatches_delivery_kind_check check (
    delivery_kind is null
    or delivery_kind in (
      'visit_day_before',
      'visit_day_today',
      'daily',
      'as_needed',
      'bedtime',
      'mood'
    )
  ),
  constraint reminder_dispatches_slot_delivery_check check (
    delivery_kind is null
    or (reminder_slot = 'visit_day_before_0800' and delivery_kind = 'visit_day_before')
    or (reminder_slot = 'visit_day_today_0800' and delivery_kind = 'visit_day_today')
    or (reminder_slot = 'medication_0900' and delivery_kind in ('daily', 'as_needed'))
    or (reminder_slot in ('daily_1100', 'daily_1300') and delivery_kind = 'daily')
    or (reminder_slot = 'mood_1500' and delivery_kind = 'mood')
    or (reminder_slot = 'bedtime_2100' and delivery_kind = 'bedtime')
  ),
  constraint reminder_dispatches_attempt_count_check check (
    attempt_count between 0 and 3
  ),
  constraint reminder_dispatches_attempt_timestamps_check check (
    (attempt_count = 0 and first_attempt_at is null)
    or (attempt_count > 0 and first_attempt_at is not null)
  ),
  constraint reminder_dispatches_retry_state_check check (
    (status = 'retryable_failed' and next_attempt_at is not null and completed_at is null)
    or (status <> 'retryable_failed' and next_attempt_at is null)
  ),
  constraint reminder_dispatches_terminal_state_check check (
    (
      status in ('sent', 'permanent_failed', 'cancelled')
      and completed_at is not null
    )
    or (
      status in ('processing', 'retryable_failed')
      and completed_at is null
    )
  ),
  constraint reminder_dispatches_sent_state_check check (
    (status = 'sent' and sent_at is not null)
    or (status <> 'sent' and sent_at is null)
  ),
  constraint reminder_dispatches_cancelled_send_check check (
    status <> 'cancelled' or send_started_at is null
  ),
  constraint reminder_dispatches_http_status_check check (
    last_http_status is null or last_http_status between 100 and 599
  ),
  constraint reminder_dispatches_error_code_check check (
    last_error_code is null
    or last_error_code in (
      'provider_429',
      'provider_5xx',
      'provider_4xx',
      'all_endpoints_revoked',
      'provider_outcome_unknown',
      'window_expired_during_send',
      'no_longer_eligible',
      'no_active_subscription',
      'window_expired_before_send',
      'retry_window_exhausted'
    )
  )
);

create index reminder_dispatches_created_at_idx
on public.reminder_dispatches (created_at);

create index reminder_dispatches_retry_due_idx
on public.reminder_dispatches (next_attempt_at, reminder_date, reminder_slot)
where status = 'retryable_failed';

create index reminder_dispatches_processing_lease_idx
on public.reminder_dispatches (lease_expires_at, reminder_date, reminder_slot)
where status = 'processing';

create index user_medications_schedule_active_user_idx
on public.user_medications (schedule, user_id, id)
where active = true;

create index visit_schedules_visit_date_user_idx
on public.visit_schedules (visit_date, user_id);

alter table public.reminder_dispatches enable row level security;
alter table public.reminder_dispatches force row level security;

revoke all on table public.reminder_dispatches from public, anon, authenticated;
grant select, insert, update, delete on table public.reminder_dispatches to service_role;

comment on table public.reminder_dispatches is
  'Service-role-only, privacy-minimized reminder delivery state retained for 35 days.';
comment on column public.reminder_dispatches.delivery_kind is
  'Categorical reminder variant only. Medication names, counts, endpoints, keys, bodies, and raw provider errors are never stored here.';

create or replace function public.reminder_slot_started_at(
  p_reminder_date date,
  p_reminder_slot text
)
returns timestamptz
language sql
immutable
security invoker
set search_path = ''
as $$
  select case p_reminder_slot
    when 'visit_day_before_0800' then pg_catalog.make_timestamptz(
      pg_catalog.date_part('year', p_reminder_date)::integer,
      pg_catalog.date_part('month', p_reminder_date)::integer,
      pg_catalog.date_part('day', p_reminder_date)::integer,
      8, 0, 0, 'Asia/Seoul'
    )
    when 'visit_day_today_0800' then pg_catalog.make_timestamptz(
      pg_catalog.date_part('year', p_reminder_date)::integer,
      pg_catalog.date_part('month', p_reminder_date)::integer,
      pg_catalog.date_part('day', p_reminder_date)::integer,
      8, 0, 0, 'Asia/Seoul'
    )
    when 'medication_0900' then pg_catalog.make_timestamptz(
      pg_catalog.date_part('year', p_reminder_date)::integer,
      pg_catalog.date_part('month', p_reminder_date)::integer,
      pg_catalog.date_part('day', p_reminder_date)::integer,
      9, 0, 0, 'Asia/Seoul'
    )
    when 'daily_1100' then pg_catalog.make_timestamptz(
      pg_catalog.date_part('year', p_reminder_date)::integer,
      pg_catalog.date_part('month', p_reminder_date)::integer,
      pg_catalog.date_part('day', p_reminder_date)::integer,
      11, 0, 0, 'Asia/Seoul'
    )
    when 'daily_1300' then pg_catalog.make_timestamptz(
      pg_catalog.date_part('year', p_reminder_date)::integer,
      pg_catalog.date_part('month', p_reminder_date)::integer,
      pg_catalog.date_part('day', p_reminder_date)::integer,
      13, 0, 0, 'Asia/Seoul'
    )
    when 'mood_1500' then pg_catalog.make_timestamptz(
      pg_catalog.date_part('year', p_reminder_date)::integer,
      pg_catalog.date_part('month', p_reminder_date)::integer,
      pg_catalog.date_part('day', p_reminder_date)::integer,
      15, 0, 0, 'Asia/Seoul'
    )
    when 'bedtime_2100' then pg_catalog.make_timestamptz(
      pg_catalog.date_part('year', p_reminder_date)::integer,
      pg_catalog.date_part('month', p_reminder_date)::integer,
      pg_catalog.date_part('day', p_reminder_date)::integer,
      21, 0, 0, 'Asia/Seoul'
    )
  end;
$$;

create or replace function public.reminder_dispatch_eligibility(
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
    from public.push_subscriptions as subscription
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

create or replace function public.claim_due_reminder_dispatches(
  p_reminder_date date,
  p_reminder_slot text,
  p_now timestamptz,
  p_window_expires_at timestamptz,
  p_batch_limit integer default 20
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

  with expired_dispatches as (
    select
      dispatch.user_id,
      dispatch.reminder_date,
      dispatch.reminder_slot
    from public.reminder_dispatches as dispatch
    where dispatch.created_at < p_now - interval '35 days'
    order by dispatch.created_at
    for update skip locked
    limit 1000
  )
  delete from public.reminder_dispatches as dispatch
  using expired_dispatches as expired
  where dispatch.user_id = expired.user_id
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
  where dispatch.status = 'processing'
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
  where dispatch.status = 'retryable_failed'
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
  where dispatch.status = 'processing'
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
  where dispatch.reminder_date = p_reminder_date
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
    and public.reminder_dispatch_eligibility(
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
  ),
  eligible as (
    select candidate.user_id
    from candidates as candidate
    where public.reminder_dispatch_eligibility(
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
      delivery_kind = null,
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

create or replace function public.prepare_reminder_dispatch(
  p_user_id uuid,
  p_reminder_date date,
  p_reminder_slot text,
  p_claim_token uuid,
  p_now timestamptz
)
returns table (
  subscription_id uuid,
  user_id uuid,
  endpoint text,
  p256dh text,
  auth text,
  delivery_kind text,
  attempt_count smallint
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_returned_count integer := 0;
  v_has_enabled_subscription boolean := false;
  v_cancel_reason text;
begin
  if p_user_id is null
    or p_reminder_date is null
    or p_reminder_slot is null
    or p_claim_token is null
    or p_now is null then
    raise exception 'Reminder prepare parameters are required.' using errcode = '22023';
  end if;

  return query
  with eligibility as (
    select public.reminder_dispatch_eligibility(
      p_user_id,
      p_reminder_date,
      p_reminder_slot
    ) as delivery_kind
  ),
  subscriptions as (
    select subscription.*
    from public.push_subscriptions as subscription
    cross join eligibility
    where eligibility.delivery_kind is not null
      and subscription.user_id = p_user_id
      and subscription.revoked_at is null
      and case
        when eligibility.delivery_kind = 'mood' then subscription.mood_enabled
        when eligibility.delivery_kind in ('visit_day_before', 'visit_day_today')
          then subscription.visit_day_enabled
        else subscription.medication_enabled
      end
    order by subscription.updated_at desc, subscription.id
    limit 4
  ),
  prepared as (
    update public.reminder_dispatches as dispatch
    set
      delivery_kind = eligibility.delivery_kind,
      send_started_at = p_now,
      first_attempt_at = coalesce(dispatch.first_attempt_at, p_now),
      attempt_count = dispatch.attempt_count + 1,
      lease_expires_at = least(
        dispatch.window_expires_at,
        p_now + interval '5 minutes'
      ),
      last_http_status = null,
      last_error_code = null,
      updated_at = p_now
    from eligibility
    where dispatch.user_id = p_user_id
      and dispatch.reminder_date = p_reminder_date
      and dispatch.reminder_slot = p_reminder_slot
      and dispatch.status = 'processing'
      and dispatch.claim_token = p_claim_token
      and dispatch.send_started_at is null
      and dispatch.lease_expires_at > p_now
      and dispatch.window_expires_at > p_now
      and dispatch.attempt_count < 3
      and eligibility.delivery_kind is not null
      and exists (select 1 from subscriptions)
    returning
      dispatch.user_id,
      dispatch.delivery_kind,
      dispatch.attempt_count
  )
  select
    subscription.id,
    subscription.user_id,
    subscription.endpoint,
    subscription.p256dh,
    subscription.auth,
    prepared.delivery_kind,
    prepared.attempt_count
  from prepared
  join subscriptions as subscription
    on subscription.user_id = prepared.user_id;

  get diagnostics v_returned_count = row_count;
  if v_returned_count > 0 then
    return;
  end if;

  select exists (
    select 1
    from public.push_subscriptions as subscription
    where subscription.user_id = p_user_id
      and subscription.revoked_at is null
      and case
        when p_reminder_slot = 'mood_1500' then subscription.mood_enabled
        when p_reminder_slot in ('visit_day_before_0800', 'visit_day_today_0800')
          then subscription.visit_day_enabled
        else subscription.medication_enabled
      end
  ) into v_has_enabled_subscription;

  v_cancel_reason := case
    when not v_has_enabled_subscription then 'no_active_subscription'
    when exists (
      select 1
      from public.reminder_dispatches as dispatch
      where dispatch.user_id = p_user_id
        and dispatch.reminder_date = p_reminder_date
        and dispatch.reminder_slot = p_reminder_slot
        and dispatch.claim_token = p_claim_token
        and dispatch.window_expires_at <= p_now
    ) then 'window_expired_before_send'
    else 'no_longer_eligible'
  end;

  update public.reminder_dispatches as dispatch
  set
    status = 'cancelled',
    lease_expires_at = null,
    send_started_at = null,
    next_attempt_at = null,
    completed_at = p_now,
    last_http_status = null,
    last_error_code = v_cancel_reason,
    updated_at = p_now
  where dispatch.user_id = p_user_id
    and dispatch.reminder_date = p_reminder_date
    and dispatch.reminder_slot = p_reminder_slot
    and dispatch.status = 'processing'
    and dispatch.claim_token = p_claim_token
    and dispatch.send_started_at is null;
end;
$$;

create or replace function public.finalize_reminder_dispatch(
  p_user_id uuid,
  p_reminder_date date,
  p_reminder_slot text,
  p_claim_token uuid,
  p_outcome text,
  p_delivery_kind text,
  p_http_status integer,
  p_error_code text,
  p_revoked_subscription_ids uuid[],
  p_now timestamptz
)
returns table (
  final_status text,
  retry_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_dispatch public.reminder_dispatches%rowtype;
  v_next_attempt_at timestamptz;
  v_final_status text;
  v_title text;
  v_body text;
  v_url text;
  v_notification_kind text;
begin
  if p_user_id is null
    or p_reminder_date is null
    or p_reminder_slot is null
    or p_claim_token is null
    or p_outcome is null
    or p_delivery_kind is null
    or p_now is null then
    raise exception 'Reminder finalization parameters are required.' using errcode = '22023';
  end if;

  select dispatch.*
  into v_dispatch
  from public.reminder_dispatches as dispatch
  where dispatch.user_id = p_user_id
    and dispatch.reminder_date = p_reminder_date
    and dispatch.reminder_slot = p_reminder_slot
  for update;

  if not found
    or v_dispatch.status <> 'processing'
    or v_dispatch.claim_token is distinct from p_claim_token
    or v_dispatch.send_started_at is null then
    raise exception 'Reminder claim is no longer finalizable.' using errcode = '40001';
  end if;

  if not coalesce((
    (p_reminder_slot = 'visit_day_before_0800' and p_delivery_kind = 'visit_day_before')
    or (p_reminder_slot = 'visit_day_today_0800' and p_delivery_kind = 'visit_day_today')
    or (p_reminder_slot = 'medication_0900' and p_delivery_kind in ('daily', 'as_needed'))
    or (p_reminder_slot in ('daily_1100', 'daily_1300') and p_delivery_kind = 'daily')
    or (p_reminder_slot = 'mood_1500' and p_delivery_kind = 'mood')
    or (p_reminder_slot = 'bedtime_2100' and p_delivery_kind = 'bedtime')
  ), false) then
    raise exception 'Invalid reminder delivery kind.' using errcode = '22023';
  end if;

  if p_delivery_kind is distinct from v_dispatch.delivery_kind then
    raise exception 'Reminder delivery kind changed after prepare.' using errcode = '22023';
  end if;

  if p_outcome is null
    or p_outcome not in ('sent', 'retryable_failed', 'permanent_failed', 'cancelled') then
    raise exception 'Invalid reminder outcome.' using errcode = '22023';
  end if;

  update public.push_subscriptions as subscription
  set
    revoked_at = p_now,
    updated_at = p_now
  where subscription.user_id = p_user_id
    and subscription.id = any(
      coalesce(p_revoked_subscription_ids, array[]::uuid[])
    )
    and subscription.revoked_at is null;

  if p_outcome = 'sent' then
    if p_http_status is not null or p_error_code is not null then
      raise exception 'Sent reminders cannot contain an error.' using errcode = '22023';
    end if;

    if p_delivery_kind = 'visit_day_before' then
      v_title := '내원일 알림';
      v_body := '내일은 병원 방문일이에요.';
      v_url := '/visits';
      v_notification_kind := 'visit_day';
    elsif p_delivery_kind = 'visit_day_today' then
      v_title := '내원일 알림';
      v_body := '오늘은 병원 방문일이에요.';
      v_url := '/visits';
      v_notification_kind := 'visit_day';
    elsif p_delivery_kind = 'daily' then
      v_title := '복용 알림';
      v_body := '오늘의 복용 여부를 확인해보세요.';
      v_url := '/';
      v_notification_kind := 'medication';
    elsif p_delivery_kind = 'as_needed' then
      v_title := '복용 알림';
      v_body := '오늘 중요한 일정이 있다면 복용 계획을 확인해보세요.';
      v_url := '/';
      v_notification_kind := 'medication';
    elsif p_delivery_kind = 'bedtime' then
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
      'reminder:' || p_reminder_date::text || ':' || p_reminder_slot,
      v_notification_kind,
      v_title,
      v_body,
      v_url,
      p_now
    )
    on conflict (user_id, notification_id) do nothing;

    update public.reminder_dispatches as dispatch
    set
      status = 'sent',
      delivery_kind = p_delivery_kind,
      lease_expires_at = null,
      next_attempt_at = null,
      sent_at = p_now,
      completed_at = p_now,
      last_http_status = null,
      last_error_code = null,
      updated_at = p_now
    where dispatch.user_id = p_user_id
      and dispatch.reminder_date = p_reminder_date
      and dispatch.reminder_slot = p_reminder_slot;

    v_final_status := 'sent';
    v_next_attempt_at := null;

  elsif p_outcome = 'retryable_failed' then
    if not coalesce((
      (p_http_status = 429 and p_error_code = 'provider_429')
      or (p_http_status between 500 and 599 and p_error_code = 'provider_5xx')
    ), false) then
      raise exception 'Only explicit 429 or 5xx failures are retryable.' using errcode = '22023';
    end if;

    v_next_attempt_at := case v_dispatch.attempt_count
      when 1 then v_dispatch.first_attempt_at + interval '5 minutes'
      when 2 then v_dispatch.first_attempt_at + interval '15 minutes'
    end;

    if v_dispatch.attempt_count >= 3
      or p_now >= v_dispatch.window_expires_at
      or v_next_attempt_at is null
      or v_next_attempt_at >= v_dispatch.window_expires_at then
      update public.reminder_dispatches as dispatch
      set
        status = 'permanent_failed',
        delivery_kind = p_delivery_kind,
        lease_expires_at = null,
        next_attempt_at = null,
        completed_at = p_now,
        last_http_status = p_http_status,
        last_error_code = 'retry_window_exhausted',
        updated_at = p_now
      where dispatch.user_id = p_user_id
        and dispatch.reminder_date = p_reminder_date
        and dispatch.reminder_slot = p_reminder_slot;

      v_final_status := 'permanent_failed';
      v_next_attempt_at := null;
    else
      update public.reminder_dispatches as dispatch
      set
        status = 'retryable_failed',
        delivery_kind = p_delivery_kind,
        lease_expires_at = null,
        send_started_at = null,
        next_attempt_at = v_next_attempt_at,
        completed_at = null,
        last_http_status = p_http_status,
        last_error_code = p_error_code,
        updated_at = p_now
      where dispatch.user_id = p_user_id
        and dispatch.reminder_date = p_reminder_date
        and dispatch.reminder_slot = p_reminder_slot;

      v_final_status := 'retryable_failed';
    end if;

  elsif p_outcome = 'cancelled' then
    if p_http_status is not null
      or p_error_code is distinct from 'window_expired_before_send' then
      raise exception 'Invalid pre-send cancellation.' using errcode = '22023';
    end if;

    update public.reminder_dispatches as dispatch
    set
      status = 'cancelled',
      delivery_kind = p_delivery_kind,
      lease_expires_at = null,
      send_started_at = null,
      next_attempt_at = null,
      completed_at = p_now,
      last_http_status = null,
      last_error_code = p_error_code,
      updated_at = p_now
    where dispatch.user_id = p_user_id
      and dispatch.reminder_date = p_reminder_date
      and dispatch.reminder_slot = p_reminder_slot;

    v_final_status := 'cancelled';
    v_next_attempt_at := null;

  else
    if not coalesce((
      (p_error_code = 'provider_outcome_unknown' and p_http_status is null)
      or (p_error_code = 'window_expired_during_send' and p_http_status is null)
      or (p_error_code = 'all_endpoints_revoked' and p_http_status in (404, 410))
      or (
        p_error_code = 'provider_4xx'
        and p_http_status between 400 and 499
        and p_http_status not in (404, 410, 429)
      )
    ), false) then
      raise exception 'Invalid permanent provider failure.' using errcode = '22023';
    end if;

    update public.reminder_dispatches as dispatch
    set
      status = 'permanent_failed',
      delivery_kind = p_delivery_kind,
      lease_expires_at = null,
      next_attempt_at = null,
      completed_at = p_now,
      last_http_status = p_http_status,
      last_error_code = p_error_code,
      updated_at = p_now
    where dispatch.user_id = p_user_id
      and dispatch.reminder_date = p_reminder_date
      and dispatch.reminder_slot = p_reminder_slot;

    v_final_status := 'permanent_failed';
    v_next_attempt_at := null;
  end if;

  return query select v_final_status, v_next_attempt_at;
end;
$$;

revoke all on function public.reminder_slot_started_at(date, text) from public, anon, authenticated;
revoke all on function public.reminder_dispatch_eligibility(uuid, date, text) from public, anon, authenticated;
revoke all on function public.claim_due_reminder_dispatches(date, text, timestamptz, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.prepare_reminder_dispatch(uuid, date, text, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.finalize_reminder_dispatch(uuid, date, text, uuid, text, text, integer, text, uuid[], timestamptz) from public, anon, authenticated;

grant execute on function public.reminder_slot_started_at(date, text) to service_role;
grant execute on function public.reminder_dispatch_eligibility(uuid, date, text) to service_role;
grant execute on function public.claim_due_reminder_dispatches(date, text, timestamptz, timestamptz, integer) to service_role;
grant execute on function public.prepare_reminder_dispatch(uuid, date, text, uuid, timestamptz) to service_role;
grant execute on function public.finalize_reminder_dispatch(uuid, date, text, uuid, text, text, integer, text, uuid[], timestamptz) to service_role;
