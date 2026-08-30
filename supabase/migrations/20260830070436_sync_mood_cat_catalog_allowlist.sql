alter table public.mood_records
  drop constraint mood_records_cat_id_check;

alter table public.mood_records
  add constraint mood_records_cat_id_check
  check (
    cat_id is null
    or cat_id in (
      'white',
      'calico',
      'tuxedo',
      'rainbow',
      'sunglasses',
      'winter',
      'party',
      'whats-up',
      'tube',
      'graduation',
      'nerd'
    )
  );

create or replace function public.merge_guest_dataset_v2(
  p_dataset_id text,
  p_medications jsonb,
  p_intakes jsonb,
  p_visit jsonb,
  p_moods jsonb
)
returns table (
  success boolean,
  claimed boolean,
  inserted_medication_count integer,
  reused_medication_count integer,
  inserted_intake_count integer,
  existing_intake_count integer,
  inserted_visit_count integer,
  reused_visit_count integer,
  inserted_mood_count integer,
  existing_mood_count integer,
  conflicts jsonb,
  failure_reason text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing_mood_dates text[] := array[]::text[];
  v_mood record;
  v_merge record;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_dataset_id is null or pg_catalog.btrim(p_dataset_id) = '' then
    return query
    select false, false, 0, 0, 0, 0, 0, 0, 0, 0, '[]'::jsonb, 'invalid_dataset_id';
    return;
  end if;

  if p_moods is null or pg_catalog.jsonb_typeof(p_moods) <> 'array' then
    return query
    select false, false, 0, 0, 0, 0, 0, 0, 0, 0, '[]'::jsonb, 'invalid_moods_payload';
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('guest_dataset_merge:user:' || v_user_id::text, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('guest_dataset_merge:dataset:' || p_dataset_id, 0)
  );

  for v_mood in
    select *
    from pg_catalog.jsonb_to_recordset(p_moods) as mood_record(
      mood_date text,
      details jsonb,
      clinic_phrase text,
      cat_id text,
      analysis_status text,
      analysis_result jsonb,
      analysis_version text,
      analysis_model text,
      analysis_created_at text
    )
  loop
    if (v_mood.details is not null and pg_catalog.jsonb_typeof(v_mood.details) <> 'object')
      or (
        v_mood.clinic_phrase is not null
        and pg_catalog.char_length(pg_catalog.btrim(v_mood.clinic_phrase)) not between 1 and 300
      )
      or (
        v_mood.cat_id is not null
        and v_mood.cat_id not in (
          'white',
          'calico',
          'tuxedo',
          'rainbow',
          'sunglasses',
          'winter',
          'party',
          'whats-up',
          'tube',
          'graduation',
          'nerd'
        )
      )
      or not (
        (
          v_mood.analysis_status is null
          and v_mood.analysis_result is null
          and v_mood.analysis_version is null
          and v_mood.analysis_model is null
          and v_mood.analysis_created_at is null
        )
        or (
          v_mood.analysis_status = 'completed'
          and coalesce(pg_catalog.jsonb_typeof(v_mood.analysis_result) = 'object', false)
          and coalesce(
            pg_catalog.char_length(pg_catalog.btrim(v_mood.analysis_version)) between 1 and 100,
            false
          )
          and coalesce(
            pg_catalog.char_length(pg_catalog.btrim(v_mood.analysis_model)) between 1 and 100,
            false
          )
          and coalesce(
            pg_catalog.pg_input_is_valid(v_mood.analysis_created_at, 'timestamp with time zone'),
            false
          )
        )
      ) then
      return query
      select false, false, 0, 0, 0, 0, 0, 0, 0, 0,
        pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
          'code', 'invalid_guest_mood_metadata',
          'message', 'Guest mood has invalid optional metadata.'
        )),
        'invalid_guest_mood_metadata';
      return;
    end if;
  end loop;

  select coalesce(
    pg_catalog.array_agg(mood_date::text),
    array[]::text[]
  )
  into v_existing_mood_dates
  from public.mood_records
  where user_id = v_user_id
    and mood_date::text in (
      select mood_record.mood_date
      from pg_catalog.jsonb_to_recordset(p_moods) as mood_record(mood_date text)
    );

  select *
  into v_merge
  from public.merge_guest_dataset(
    p_dataset_id,
    p_medications,
    p_intakes,
    p_visit,
    p_moods
  );

  if v_merge.success then
    update public.mood_records as stored
    set
      details = incoming.details,
      clinic_phrase = pg_catalog.btrim(incoming.clinic_phrase),
      cat_id = incoming.cat_id,
      analysis_status = incoming.analysis_status,
      analysis_result = incoming.analysis_result,
      analysis_version = pg_catalog.btrim(incoming.analysis_version),
      analysis_model = pg_catalog.btrim(incoming.analysis_model),
      analysis_created_at = incoming.analysis_created_at::timestamptz
    from pg_catalog.jsonb_to_recordset(p_moods) as incoming(
      mood_date text,
      details jsonb,
      clinic_phrase text,
      cat_id text,
      analysis_status text,
      analysis_result jsonb,
      analysis_version text,
      analysis_model text,
      analysis_created_at text
    )
    where stored.user_id = v_user_id
      and stored.mood_date::text = incoming.mood_date
      and not (incoming.mood_date = any(v_existing_mood_dates));
  end if;

  return query
  select
    v_merge.success,
    v_merge.claimed,
    v_merge.inserted_medication_count,
    v_merge.reused_medication_count,
    v_merge.inserted_intake_count,
    v_merge.existing_intake_count,
    v_merge.inserted_visit_count,
    v_merge.reused_visit_count,
    v_merge.inserted_mood_count,
    v_merge.existing_mood_count,
    v_merge.conflicts,
    v_merge.failure_reason;
end;
$$;

revoke all on function public.merge_guest_dataset_v2(text, jsonb, jsonb, jsonb, jsonb) from public;
grant execute on function public.merge_guest_dataset_v2(text, jsonb, jsonb, jsonb, jsonb) to authenticated;
