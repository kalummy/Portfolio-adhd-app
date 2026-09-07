-- No Production run or subscription is created by this migration.
create table public.push_e2e_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  subscription_fingerprint text not null check (subscription_fingerprint ~ '^[0-9a-f]{64}$'),
  status text not null default 'ready' check (status in ('ready', 'consumed', 'failed', 'expired', 'cancelled')),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  provider_status integer check (provider_status between 100 and 599),
  error_code text check (error_code in ('provider_rejected', 'provider_timeout', 'provider_network_error',
    'target_invalid', 'disabled_before_send')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (expires_at > created_at and expires_at <= created_at + interval '10 minutes'),
  check ((status in ('consumed', 'failed')) = (consumed_at is not null)),
  check (status in ('consumed', 'failed') or (provider_status is null and error_code is null)),
  check (status <> 'failed' or error_code is not null),
  check (status <> 'consumed' or (error_code is null and (provider_status is null or provider_status between 200 and 299)))
);
create index push_e2e_runs_user_idx on public.push_e2e_runs (user_id);
create index push_e2e_runs_subscription_idx on public.push_e2e_runs (subscription_id);

alter table public.push_e2e_runs enable row level security;
alter table public.push_e2e_runs force row level security;
revoke all on table public.push_e2e_runs from public, anon, authenticated, service_role;
grant select, insert, update on table public.push_e2e_runs to service_role;
-- Deliberately no client policies. service_role bypasses RLS; no client can read runs or targets.

create function public.guard_push_e2e_run()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    if new.status <> 'ready' or new.consumed_at is not null
      or new.provider_status is not null or new.error_code is not null then
      raise exception 'e2e_invalid_initial_state';
    end if;
  else
    if row(new.id, new.user_id, new.subscription_id, new.subscription_fingerprint, new.expires_at, new.created_at)
      is distinct from row(old.id, old.user_id, old.subscription_id, old.subscription_fingerprint, old.expires_at, old.created_at) then
      raise exception 'e2e_target_immutable';
    end if;
    if old.status = 'ready' then
      if new.status not in ('consumed', 'expired', 'cancelled') then raise exception 'e2e_invalid_transition'; end if;
      if new.status = 'consumed' and old.expires_at <= clock_timestamp() then raise exception 'e2e_expired'; end if;
    elsif old.status = 'consumed' and old.provider_status is null and old.error_code is null then
      if new.status not in ('consumed', 'failed') or new.consumed_at is distinct from old.consumed_at
        or (new.provider_status is null and new.error_code is null) then raise exception 'e2e_invalid_result'; end if;
    else
      raise exception 'e2e_terminal_run';
    end if;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
create trigger guard_push_e2e_run before insert or update on public.push_e2e_runs
for each row execute function public.guard_push_e2e_run();

-- Operator-only preparation. Count globally BEFORE checking owner/active to reject ambiguous prefixes.
-- The web client cannot call this function. It receives only the separately approved run ID.
create function public.prepare_push_e2e_run(p_user_id uuid, p_fingerprint_prefix text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  candidate public.push_subscriptions%rowtype;
  matches uuid[];
  full_fingerprint text;
  run_id uuid;
  prepared_at timestamptz;
begin
  if p_user_id is null or p_fingerprint_prefix is null or p_fingerprint_prefix !~ '^[0-9a-f]{16,64}$' then
    raise exception 'e2e_invalid_target';
  end if;
  select array_agg(s.id) into matches from public.push_subscriptions s
  where encode(extensions.digest(convert_to(s.endpoint, 'UTF8'), 'sha256'), 'hex') like p_fingerprint_prefix || '%';
  if coalesce(cardinality(matches), 0) <> 1 then raise exception 'e2e_target_not_unique'; end if;
  select * into candidate from public.push_subscriptions where id = matches[1] for share;
  full_fingerprint := encode(extensions.digest(convert_to(candidate.endpoint, 'UTF8'), 'sha256'), 'hex');
  if not found or candidate.user_id <> p_user_id or candidate.revoked_at is not null
    or full_fingerprint not like p_fingerprint_prefix || '%' then raise exception 'e2e_invalid_target'; end if;
  prepared_at := clock_timestamp();
  insert into public.push_e2e_runs(user_id, subscription_id, subscription_fingerprint, created_at, expires_at)
  values (p_user_id, candidate.id, full_fingerprint, prepared_at, prepared_at + interval '10 minutes')
  returning id into run_id;
  return run_id;
end;
$$;

-- One transaction, one row lock, one irreversible consume. A lost RPC response never permits a send.
-- Returns credentials only to the server/service-role after successful consumption; never stores/logs them.
create function public.consume_push_e2e_run(p_run_id uuid, p_user_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  target public.push_e2e_runs%rowtype;
  subscription public.push_subscriptions%rowtype;
begin
  select * into target from public.push_e2e_runs
  where id = p_run_id and user_id = p_user_id for update;
  if not found or target.status <> 'ready' then return null; end if;
  if target.expires_at <= clock_timestamp() then
    update public.push_e2e_runs set status = 'expired' where id = target.id;
    return null;
  end if;
  select * into subscription from public.push_subscriptions
  where id = target.subscription_id and user_id = target.user_id and revoked_at is null for share;
  if not found then return null; end if;
  if encode(extensions.digest(convert_to(subscription.endpoint, 'UTF8'), 'sha256'), 'hex')
    <> target.subscription_fingerprint then return null; end if;
  update public.push_e2e_runs set status = 'consumed', consumed_at = clock_timestamp()
  where id = target.id and status = 'ready' and expires_at > clock_timestamp() returning * into target;
  if not found then return null; end if;
  return jsonb_build_object('id', target.id, 'user_id', target.user_id,
    'subscription_id', target.subscription_id, 'subscription_fingerprint', target.subscription_fingerprint,
    'status', target.status, 'expires_at', target.expires_at, 'consumed_at', target.consumed_at,
    'subscription', jsonb_build_object('id', subscription.id, 'user_id', subscription.user_id,
      'endpoint', subscription.endpoint, 'p256dh', subscription.p256dh, 'auth', subscription.auth,
      'revoked_at', subscription.revoked_at));
end;
$$;

revoke all on function public.guard_push_e2e_run() from public, anon, authenticated, service_role;
revoke all on function public.prepare_push_e2e_run(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.consume_push_e2e_run(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.guard_push_e2e_run() to service_role;
grant execute on function public.prepare_push_e2e_run(uuid, text) to service_role;
grant execute on function public.consume_push_e2e_run(uuid, uuid) to service_role;
