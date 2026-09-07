-- ADDI Dev only. All synthetic rows and temporary functions are rolled back. Never invokes Web Push.
begin;
create temporary table e2e_before as select
  (select count(*) from public.app_notifications) notifications,
  (select count(*) from public.reminder_dispatches) reminders,
  (select md5(coalesce(string_agg(to_jsonb(s)::text, '' order by id), '')) from public.push_subscriptions s) subscriptions;

insert into auth.users(id) values ('e2e00000-0000-4000-8000-000000000001'), ('e2e00000-0000-4000-8000-000000000002');
insert into public.push_subscriptions(id, user_id, endpoint, p256dh, auth) values
('e2e10000-0000-4000-8000-000000000001', 'e2e00000-0000-4000-8000-000000000001', 'https://push.invalid/e2e-db-chrome', 'synthetic-p256dh-only', 'synthetic-auth'),
('e2e10000-0000-4000-8000-000000000002', 'e2e00000-0000-4000-8000-000000000001', 'https://push.invalid/e2e-db-other', 'synthetic-p256dh-only', 'synthetic-auth'),
('e2e10000-0000-4000-8000-000000000003', 'e2e00000-0000-4000-8000-000000000002', 'https://push.invalid/e2e-db-other-user', 'synthetic-p256dh-only', 'synthetic-auth');

do $$
declare
  owner_id uuid := 'e2e00000-0000-4000-8000-000000000001';
  other_id uuid := 'e2e00000-0000-4000-8000-000000000002';
  subscription_id uuid := 'e2e10000-0000-4000-8000-000000000001';
  fingerprint text;
  r uuid;
  claimed jsonb;
  state text;
  denied boolean;
  c record;
begin
  select encode(extensions.digest(convert_to(endpoint,'UTF8'),'sha256'),'hex') into fingerprint
  from public.push_subscriptions where id=subscription_id;
  assert public.consume_push_e2e_run(gen_random_uuid(),owner_id) is null, 'missing run';
  r := public.prepare_push_e2e_run(owner_id,left(fingerprint,16));
  assert public.consume_push_e2e_run(r,other_id) is null, 'other logged user';
  claimed := public.consume_push_e2e_run(r,owner_id);
  assert claimed->>'subscription_id'=subscription_id::text, 'exact subscription';
  assert claimed->>'subscription_fingerprint'=fingerprint, 'full hash';
  assert claimed->>'status'='consumed', 'consume before send';
  assert public.consume_push_e2e_run(r,owner_id) is null, 'sequential replay';
  update public.push_e2e_runs set provider_status=201 where id=r;
  denied := false;
  begin update public.push_e2e_runs set status='ready',consumed_at=null,provider_status=null where id=r;
  exception when others then denied := true; end;
  assert denied, 'terminal cannot reset';

  for c in select * from (values ('fingerprint'),('subscription_id'),('owner'),('revoked'),('expired'),('cancelled')) v(kind) loop
    insert into public.push_e2e_runs(user_id,subscription_id,subscription_fingerprint,created_at,expires_at)
    values(owner_id,
      case when c.kind='subscription_id' then 'e2e10000-0000-4000-8000-000000000002'::uuid
           when c.kind='owner' then 'e2e10000-0000-4000-8000-000000000003'::uuid else subscription_id end,
      case when c.kind='fingerprint' then repeat('0',64) else fingerprint end,
      clock_timestamp()-interval '5 minutes',
      case when c.kind='expired' then clock_timestamp()-interval '1 minute' else clock_timestamp()+interval '4 minutes' end)
    returning id into r;
    if c.kind='revoked' then update public.push_subscriptions set revoked_at=clock_timestamp() where id=subscription_id; end if;
    if c.kind='cancelled' then update public.push_e2e_runs set status='cancelled' where id=r; end if;
    assert public.consume_push_e2e_run(r,owner_id) is null, 'invalid target sent: '||c.kind;
    if c.kind='revoked' then update public.push_subscriptions set revoked_at=null where id=subscription_id; end if;
  end loop;

  for c in select * from (values (404),(410),(429),(500),(503),(null::integer)) v(code) loop
    r := public.prepare_push_e2e_run(owner_id,fingerprint);
    assert public.consume_push_e2e_run(r,owner_id) is not null;
    update public.push_e2e_runs set status='failed',provider_status=c.code,
      error_code=case when c.code is null then 'provider_timeout' else 'provider_rejected' end where id=r;
    assert public.consume_push_e2e_run(r,owner_id) is null, 'failure replay';
    assert (select revoked_at is null from public.push_subscriptions where id=subscription_id), 'no auto revoke';
  end loop;

  denied := false;
  begin perform public.prepare_push_e2e_run(owner_id,repeat('0',64));
  exception when others then denied := SQLERRM='e2e_target_not_unique'; end;
  assert denied, 'zero matches denied';
  denied := false;
  begin perform public.prepare_push_e2e_run(other_id,fingerprint);
  exception when others then denied := SQLERRM='e2e_invalid_target'; end;
  assert denied, 'prepare wrong owner denied';

  assert (select relrowsecurity and relforcerowsecurity from pg_class where oid='public.push_e2e_runs'::regclass);
  for c in select unnest(array['anon','authenticated']) role loop
    assert not has_table_privilege(c.role,'public.push_e2e_runs','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');
    assert not has_function_privilege(c.role,'public.consume_push_e2e_run(uuid,uuid)','EXECUTE');
    assert not has_function_privilege(c.role,'public.prepare_push_e2e_run(uuid,text)','EXECUTE');
  end loop;
  assert has_table_privilege('service_role','public.push_e2e_runs','SELECT,INSERT,UPDATE');
  assert has_function_privilege('service_role','public.consume_push_e2e_run(uuid,uuid)','EXECUTE');
  assert not exists(select 1 from pg_proc where oid in ('public.consume_push_e2e_run(uuid,uuid)'::regprocedure,
    'public.prepare_push_e2e_run(uuid,text)'::regprocedure) and prosecdef), 'security invoker';
end;
$$;

-- Exercise the actual preparation function's collision branch with a temporary hash dependency.
-- No real 64-bit prefix collision is assumed; public/extension functions remain untouched.
create function pg_temp.e2e_collision_digest(value bytea, algorithm text) returns bytea
language sql as $$ select case when convert_from(value,'UTF8') in
  ('https://push.invalid/e2e-db-chrome','https://push.invalid/e2e-db-other')
  then decode(repeat('a',64),'hex') else extensions.digest(value,algorithm) end $$;
do $$
declare definition text; denied boolean := false;
begin
  select pg_get_functiondef('public.prepare_push_e2e_run(uuid,text)'::regprocedure) into definition;
  definition := replace(definition,'public.prepare_push_e2e_run','pg_temp.prepare_collision_run');
  definition := replace(definition,'extensions.digest','pg_temp.e2e_collision_digest');
  execute definition;
  begin perform pg_temp.prepare_collision_run('e2e00000-0000-4000-8000-000000000001',repeat('a',16));
  exception when others then denied := SQLERRM='e2e_target_not_unique'; end;
  assert denied, 'two matches denied';
end;
$$;

set local role anon;
do $$ declare denied boolean := false; begin
  begin perform count(*) from public.push_e2e_runs; exception when insufficient_privilege then denied:=true; end;
  assert denied, 'anon table denied';
  denied:=false;
  begin perform public.consume_push_e2e_run(gen_random_uuid(),gen_random_uuid()); exception when insufficient_privilege then denied:=true; end;
  assert denied, 'anon RPC denied';
end $$;
reset role;
set local role authenticated;
do $$ declare denied boolean := false; begin
  begin perform count(*) from public.push_e2e_runs; exception when insufficient_privilege then denied:=true; end;
  assert denied, 'authenticated table denied';
end $$;
reset role;
set local role service_role;
do $$ declare r uuid; fingerprint text; begin
  assert public.consume_push_e2e_run(gen_random_uuid(),gen_random_uuid()) is null, 'service RPC permitted';
  select encode(extensions.digest(convert_to(endpoint,'UTF8'),'sha256'),'hex') into fingerprint
  from public.push_subscriptions where id='e2e10000-0000-4000-8000-000000000001';
  r:=public.prepare_push_e2e_run('e2e00000-0000-4000-8000-000000000001',fingerprint);
  assert public.consume_push_e2e_run(r,'e2e00000-0000-4000-8000-000000000001') is not null, 'service real consume permitted';
  update public.push_e2e_runs set provider_status=201 where id=r;
end $$;
reset role;

delete from auth.users where id in ('e2e00000-0000-4000-8000-000000000001','e2e00000-0000-4000-8000-000000000002');
do $$ begin
  assert (select notifications=(select count(*) from public.app_notifications) from e2e_before);
  assert (select reminders=(select count(*) from public.reminder_dispatches) from e2e_before);
  assert (select subscriptions=(select md5(coalesce(string_agg(to_jsonb(s)::text,'' order by id),'')) from public.push_subscriptions s) from e2e_before), 'existing subscriptions unchanged';
end $$;
select 'PASS: DB ownership/hash/id/state/expiry/one-shot/results/zero-and-multiple-matches/RLS/grants/isolation; provider calls=0' as result;
rollback;
