-- ADDI Dev only. Synthetic users/records are transactionally rolled back. No Push is sent.
begin;
do $$
declare u uuid:=gen_random_uuid();other uuid:=gen_random_uuid();inst uuid:=gen_random_uuid();binding uuid:=gen_random_uuid();rid uuid;wid uuid;
 secret text:=repeat('a',64); prefs jsonb:='{"medication":true,"visit_day":true,"mood":true}'; disabled jsonb:='{"medication":false,"visit_day":false,"mood":false}';
 day date:='2099-01-01';slot text;kind text;claim record;prepared jsonb;result text;blocked boolean;started_at timestamptz;
begin
 insert into auth.users(id,aud,role) values(u,'authenticated','authenticated'),(other,'authenticated','authenticated');
 rid:=public.register_native_push(u,inst,secret,1,binding,'synthetic-token-native-qa-only','qa',prefs);
 if (select user_id from public.native_push_registrations where id=rid)<>u then raise exception 'owner mismatch';end if;
 blocked:=false;begin perform public.register_native_push(other,inst,repeat('b',64),2,gen_random_uuid(),'synthetic-token-native-qa-only','qa',disabled);exception when insufficient_privilege then blocked:=true;end;if not blocked then raise exception 'capability bypass';end if;
 blocked:=false;begin perform public.register_native_push(other,inst,secret,2,gen_random_uuid(),'synthetic-token-native-qa-only','qa',prefs);exception when insufficient_privilege then blocked:=true;end;if not blocked then raise exception 'preferences inherited';end if;
 if not public.rotate_native_push(inst,secret,2,binding,'synthetic-token-rotated-native-qa') then raise exception 'rotation failed';end if;
 if public.rotate_native_push(inst,secret,1,binding,'synthetic-token-stale-native-qa') then raise exception 'stale rotation';end if;
 insert into public.user_medications(id,user_id,name,strength_value,strength_unit,image_path,registration_method,schedule,active)
 values ('native-qa-daily',u,'synthetic',1,'mg','/synthetic','manual','daily',true),('native-qa-prn',u,'synthetic',1,'mg','/synthetic','manual','as-needed',true),('native-qa-bed',u,'synthetic',1,'mg','/synthetic','manual','bedtime',true);
 insert into public.visit_schedules(user_id,visit_id,visit_date,created_at,updated_at) values(u,'upcoming',day,now(),now());
 foreach slot in array array['visit_day_before_0800','visit_day_today_0800','medication_0900','daily_1100','daily_1300','mood_1500','bedtime_2100'] loop
  update public.visit_schedules set visit_date=case when slot='visit_day_before_0800' then day+1 else day end where user_id=u;
  kind:=public.reminder_dispatch_eligibility_v2(u,day,slot);if kind is null then raise exception 'Native-only excluded: %',slot;end if;
  if public.reminder_dispatch_eligibility(u,day,slot) is not null then raise exception 'fixture unexpectedly Web eligible';end if;
 end loop;
 -- Exercise actual Native-only claims and delivery for all seven policy slots.
 foreach slot in array array['visit_day_before_0800','visit_day_today_0800','medication_0900','daily_1100','daily_1300','mood_1500','bedtime_2100'] loop
  update public.visit_schedules set visit_date=case when slot='visit_day_before_0800' then day+2 else day+1 end where user_id=u;
  started_at:=public.reminder_slot_started_at(day+1,slot);
  select * into claim from public.claim_due_reminder_dispatches_v2(day+1,slot,started_at,started_at+interval '30 minutes',1,u);
  if claim.user_id is null then raise exception 'Native-only actual claim missing: %',slot;end if;
  prepared:=public.prepare_reminder_dispatch_v2(u,day+1,slot,claim.claim_token,started_at);
  if jsonb_array_length(prepared->'targets')<>1 or prepared->'targets'->0->>'transport'<>'fcm' then raise exception 'Native-only delivery target';end if;
  perform public.finish_reminder_target_v2(u,day+1,slot,claim.claim_token,'fcm',rid,'sent',null,null,started_at);
  result:=public.finalize_reminder_dispatch_v2(u,day+1,slot,claim.claim_token,started_at);
  if result<>'sent' then raise exception 'Native-only finalize failed';end if;
 end loop;
 if public.reminder_dispatch_eligibility_v2(u,day,'medication_0900')<>'daily' then raise exception 'daily priority changed';end if;
 update public.user_medications set active=false where user_id=u and schedule='daily';
 if public.reminder_dispatch_eligibility_v2(u,day,'medication_0900')<>'as_needed' then raise exception 'PRN fallback changed';end if;
 if public.reminder_dispatch_eligibility_v2(u,day,'daily_1100') is not null then raise exception 'PRN outside 09';end if;
 -- Both transports share one logical claim, but keep individual results and retry targets.
 insert into public.push_subscriptions(user_id,endpoint,p256dh,auth,medication_enabled,visit_day_enabled,mood_enabled)
 values(u,'https://synthetic.invalid/native-qa',repeat('a',24),repeat('b',24),true,true,true) returning id into wid;
 select * into claim from public.claim_due_reminder_dispatches_v2(day,'mood_1500','2099-01-01T06:00:00Z','2099-01-01T06:30:00Z',1,u);
 if claim.user_id is null then raise exception 'claim missing';end if;
 if exists(select 1 from public.claim_due_reminder_dispatches_v2(day,'mood_1500','2099-01-01T06:00:01Z','2099-01-01T06:30:00Z',1,u)) then raise exception 'duplicate claim';end if;
 prepared:=public.prepare_reminder_dispatch_v2(u,day,'mood_1500',claim.claim_token,'2099-01-01T06:00:00Z');
 if jsonb_array_length(prepared->'targets')<>2 then raise exception 'transport target selection';end if;
 perform public.finish_reminder_target_v2(u,day,'mood_1500',claim.claim_token,'web',wid,'sent',null,null,'2099-01-01T06:00:01Z');
 perform public.finish_reminder_target_v2(u,day,'mood_1500',claim.claim_token,'fcm',rid,'retryable_failed',503,'provider_5xx','2099-01-01T06:00:01Z');
 result:=public.finalize_reminder_dispatch_v2(u,day,'mood_1500',claim.claim_token,'2099-01-01T06:00:02Z');
 if result<>'retryable_failed' then raise exception 'retry missing';end if;
 if (select count(*) from public.app_notifications where user_id=u and notification_id='reminder:2099-01-01:mood_1500')<>1 then raise exception 'first successful delivery history missing';end if;
 select * into claim from public.claim_due_reminder_dispatches_v2(day,'mood_1500','2099-01-01T06:05:00Z','2099-01-01T06:30:00Z',1,u);
 prepared:=public.prepare_reminder_dispatch_v2(u,day,'mood_1500',claim.claim_token,'2099-01-01T06:05:00Z');
 if jsonb_array_length(prepared->'targets')<>1 or prepared->'targets'->0->>'transport'<>'fcm' then raise exception 'successful Web target retried';end if;
 perform public.finish_reminder_target_v2(u,day,'mood_1500',claim.claim_token,'fcm',rid,'sent',null,null,'2099-01-01T06:05:01Z');
 result:=public.finalize_reminder_dispatch_v2(u,day,'mood_1500',claim.claim_token,'2099-01-01T06:05:02Z');
 if result<>'sent' or (select count(*) from public.app_notifications where user_id=u and notification_id='reminder:2099-01-01:mood_1500')<>1 then raise exception 'logical outcome/history duplicate';end if;
 if not public.revoke_native_push(inst,secret,3) then raise exception 'logout revoke failed';end if;
 blocked:=false;begin perform public.register_native_push(u,inst,secret,2,binding,'synthetic-token-stale-native-qa','qa',prefs);exception when insufficient_privilege then blocked:=true;end;if not blocked then raise exception 'late registration undid logout';end if;
 perform public.register_native_push(other,inst,secret,4,gen_random_uuid(),'synthetic-token-new-account-qa','qa',disabled);
 if (select user_id from public.native_push_registrations where id=rid)<>other then raise exception 'account switch failed';end if;
 if public.revoke_native_push(inst,secret,3) then raise exception 'late logout revoked new owner';end if;
 if has_table_privilege('authenticated','public.native_push_registrations','SELECT') or has_function_privilege('anon','public.register_native_push(uuid,uuid,text,bigint,uuid,text,text,jsonb)','EXECUTE') then raise exception 'grant leak';end if;
end $$;
rollback;
select 'PASS: synthetic ownership, rotation, logout, Native-only policy, dual transport retry and grants; all fixtures rolled back' as result;
