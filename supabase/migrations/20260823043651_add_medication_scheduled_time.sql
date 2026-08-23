alter table public.user_medications
add column scheduled_time time without time zone;

create or replace function public.migrate_initial_user_medications(
  p_medications jsonb
)
returns table (
  migrated boolean,
  inserted_count integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_inserted_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_medications is null or pg_catalog.jsonb_typeof(p_medications) <> 'array' then
    raise exception 'p_medications must be a JSON array.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'user_medications_initial_migration:' || v_user_id::text,
      0
    )
  );

  if exists (
    select 1
    from public.user_medications
    where user_id = v_user_id
  ) then
    return query select false, 0;
    return;
  end if;

  if pg_catalog.jsonb_array_length(p_medications) = 0 then
    return query select false, 0;
    return;
  end if;

  insert into public.user_medications (
    id,
    user_id,
    catalog_id,
    display_label,
    name,
    ingredient_name,
    strength_value,
    strength_unit,
    manufacturer,
    english_name,
    image_path,
    product_image,
    fallback_image,
    image_type,
    image_source_name,
    image_source_url,
    search_keywords,
    official_match_status,
    registration_method,
    schedule,
    scheduled_time,
    active,
    deactivated_at,
    created_at,
    updated_at
  )
  select
    medication.id,
    v_user_id,
    medication.catalog_id,
    medication.display_label,
    medication.name,
    medication.ingredient_name,
    medication.strength_value,
    medication.strength_unit,
    medication.manufacturer,
    medication.english_name,
    medication.image_path,
    medication.product_image,
    medication.fallback_image,
    medication.image_type,
    medication.image_source_name,
    medication.image_source_url,
    medication.search_keywords,
    medication.official_match_status,
    medication.registration_method,
    medication.schedule,
    medication.scheduled_time,
    medication.active,
    medication.deactivated_at,
    medication.created_at,
    medication.updated_at
  from pg_catalog.jsonb_to_recordset(p_medications) as medication (
    id text,
    catalog_id text,
    display_label text,
    name text,
    ingredient_name text,
    strength_value double precision,
    strength_unit text,
    manufacturer text,
    english_name text,
    image_path text,
    product_image text,
    fallback_image text,
    image_type text,
    image_source_name text,
    image_source_url text,
    search_keywords text[],
    official_match_status text,
    registration_method text,
    schedule text,
    scheduled_time time without time zone,
    active boolean,
    deactivated_at timestamptz,
    created_at timestamptz,
    updated_at timestamptz
  );

  get diagnostics v_inserted_count = row_count;
  return query select true, v_inserted_count;
end;
$$;

revoke all on function public.migrate_initial_user_medications(jsonb) from public;
revoke all on function public.migrate_initial_user_medications(jsonb) from anon;
grant execute on function public.migrate_initial_user_medications(jsonb) to authenticated;

create or replace function public.merge_guest_medication_dataset(
  p_dataset_id text,
  p_medications jsonb,
  p_intakes jsonb
)
returns table (
  success boolean,
  claimed boolean,
  inserted_medication_count integer,
  reused_medication_count integer,
  inserted_intake_count integer,
  existing_intake_count integer,
  conflicts jsonb,
  failure_reason text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_claim_user_id uuid;
  v_conflicts jsonb := '[]'::jsonb;
  v_mapping jsonb := '{}'::jsonb;
  v_new_medications jsonb := '[]'::jsonb;
  v_valid_intakes jsonb := '[]'::jsonb;
  v_medication record;
  v_intake record;
  v_existing_medication public.user_medications%rowtype;
  v_candidate_count integer := 0;
  v_candidate_id text;
  v_server_medication_id text;
  v_reused_medication_count integer := 0;
  v_inserted_medication_count integer := 0;
  v_inserted_intake_count integer := 0;
  v_existing_intake_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_dataset_id is null or pg_catalog.btrim(p_dataset_id) = '' then
    return query select false, false, 0, 0, 0, 0, '[]'::jsonb, 'invalid_dataset_id';
    return;
  end if;

  if p_medications is null or pg_catalog.jsonb_typeof(p_medications) <> 'array' then
    return query select false, false, 0, 0, 0, 0, '[]'::jsonb, 'invalid_medications_payload';
    return;
  end if;

  if p_intakes is null or pg_catalog.jsonb_typeof(p_intakes) <> 'array' then
    return query select false, false, 0, 0, 0, 0, '[]'::jsonb, 'invalid_intakes_payload';
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('guest_dataset_merge:user:' || v_user_id::text, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('guest_dataset_merge:dataset:' || p_dataset_id, 0)
  );

  select user_id
  into v_claim_user_id
  from public.guest_dataset_claims
  where dataset_id = p_dataset_id;

  if found then
    if v_claim_user_id = v_user_id then
      return query select true, true, 0, 0, 0, 0, '[]'::jsonb, 'already_claimed';
      return;
    end if;

    return query
    select false, false, 0, 0, 0, 0,
      jsonb_build_array(jsonb_build_object(
        'code', 'dataset_claimed_by_another_user',
        'message', 'Guest dataset is already claimed by another user.'
      )),
      'dataset_claimed_by_another_user';
    return;
  end if;

  select coalesce(
    jsonb_agg(jsonb_build_object(
      'code', 'duplicate_guest_medication_id',
      'medicationId', medication_id,
      'message', 'Guest medication ids must be unique.'
    )),
    '[]'::jsonb
  )
  into v_conflicts
  from (
    select id as medication_id
    from jsonb_to_recordset(p_medications) as medication(id text)
    where id is not null and pg_catalog.btrim(id) <> ''
    group by id
    having pg_catalog.count(*) > 1
  ) duplicate_medications;

  if jsonb_array_length(v_conflicts) > 0 then
    return query select false, false, 0, 0, 0, 0, v_conflicts, 'medication_conflict';
    return;
  end if;

  for v_medication in
    select *
    from jsonb_to_recordset(p_medications) as medication(
      id text,
      catalog_id text,
      display_label text,
      name text,
      ingredient_name text,
      strength_value double precision,
      strength_unit text,
      manufacturer text,
      english_name text,
      image_path text,
      product_image text,
      fallback_image text,
      image_type text,
      image_source_name text,
      image_source_url text,
      search_keywords text[],
      official_match_status text,
      registration_method text,
      schedule text,
      scheduled_time time without time zone,
      active boolean,
      deactivated_at timestamptz,
      created_at timestamptz,
      updated_at timestamptz
    )
  loop
    if v_medication.id is null
      or pg_catalog.btrim(v_medication.id) = ''
      or v_medication.name is null
      or v_medication.strength_value is null
      or v_medication.strength_unit <> 'mg'
      or v_medication.image_path is null
      or v_medication.registration_method not in ('search', 'manual', 'photo')
      or v_medication.schedule not in ('daily', 'as-needed', 'bedtime')
      or v_medication.created_at is null then
      v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
        'code', 'invalid_guest_medication',
        'medicationId', v_medication.id,
        'message', 'Guest medication is missing required fields.'
      ));
      continue;
    end if;

    select *
    into v_existing_medication
    from public.user_medications
    where user_id = v_user_id
      and id = v_medication.id;

    if found then
      if not (
        v_existing_medication.catalog_id is not distinct from v_medication.catalog_id
        and v_existing_medication.name = v_medication.name
        and v_existing_medication.ingredient_name is not distinct from v_medication.ingredient_name
        and v_existing_medication.strength_value = v_medication.strength_value
        and v_existing_medication.strength_unit = v_medication.strength_unit
        and v_existing_medication.manufacturer is not distinct from v_medication.manufacturer
        and v_existing_medication.schedule = v_medication.schedule
        and v_existing_medication.scheduled_time is not distinct from v_medication.scheduled_time
      ) then
        v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
          'code', 'same_id_medication_conflict',
          'medicationId', v_medication.id,
          'message', 'Existing server medication with the same id has conflicting identity fields.'
        ));
      else
        v_mapping := v_mapping || jsonb_build_object(v_medication.id, v_existing_medication.id);
        v_reused_medication_count := v_reused_medication_count + 1;
      end if;
      continue;
    end if;

    if v_medication.catalog_id is not null and pg_catalog.btrim(v_medication.catalog_id) <> '' then
      select pg_catalog.count(*)::integer, min(id)
      into v_candidate_count, v_candidate_id
      from public.user_medications
      where user_id = v_user_id
        and id <> v_medication.id
        and active is true
        and catalog_id = v_medication.catalog_id
        and name = v_medication.name
        and ingredient_name is not distinct from v_medication.ingredient_name
        and strength_value = v_medication.strength_value
        and strength_unit = v_medication.strength_unit
        and manufacturer is not distinct from v_medication.manufacturer
        and schedule = v_medication.schedule
        and scheduled_time is not distinct from v_medication.scheduled_time;

      if v_candidate_count = 1 then
        v_mapping := v_mapping || jsonb_build_object(v_medication.id, v_candidate_id);
        v_reused_medication_count := v_reused_medication_count + 1;
        continue;
      elsif v_candidate_count > 1 then
        v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
          'code', 'ambiguous_catalog_medication_match',
          'medicationId', v_medication.id,
          'message', 'Multiple active server medications match the guest catalog medication.'
        ));
        continue;
      end if;
    end if;

    v_mapping := v_mapping || jsonb_build_object(v_medication.id, v_medication.id);
    v_new_medications := v_new_medications || jsonb_build_array(to_jsonb(v_medication));
  end loop;

  for v_intake in
    select *
    from jsonb_to_recordset(p_intakes) as intake(
      medication_id text,
      intake_date text,
      recorded_at text,
      taken boolean
    )
  loop
    if coalesce(v_intake.taken, false) is false then
      continue;
    end if;

    if v_intake.medication_id is null
      or v_intake.intake_date is null
      or v_intake.recorded_at is null
      or v_intake.intake_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or not pg_catalog.pg_input_is_valid(v_intake.intake_date, 'date')
      or pg_catalog.to_char(v_intake.intake_date::date, 'YYYY-MM-DD') <> v_intake.intake_date
      or not pg_catalog.pg_input_is_valid(v_intake.recorded_at, 'timestamp with time zone') then
      v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
        'code', 'invalid_guest_intake',
        'intakeRecordId', coalesce(v_intake.intake_date, '') || ':' || coalesce(v_intake.medication_id, ''),
        'message', 'Guest intake has invalid medication, date, or recordedAt fields.'
      ));
      continue;
    end if;

    v_server_medication_id := v_mapping ->> v_intake.medication_id;
    if v_server_medication_id is null then
      v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
        'code', 'missing_medication_mapping',
        'medicationId', v_intake.medication_id,
        'intakeRecordId', v_intake.intake_date || ':' || v_intake.medication_id,
        'message', 'Guest intake references a medication that cannot be mapped.'
      ));
      continue;
    end if;

    v_valid_intakes := v_valid_intakes || jsonb_build_array(jsonb_build_object(
      'medication_id', v_server_medication_id,
      'intake_date', v_intake.intake_date,
      'recorded_at', v_intake.recorded_at
    ));
  end loop;

  if jsonb_array_length(v_conflicts) > 0 then
    return query select false, false, 0, 0, 0, 0, v_conflicts, 'guest_dataset_conflict';
    return;
  end if;

  with inserted_medications as (
    insert into public.user_medications (
      id,
      user_id,
      catalog_id,
      display_label,
      name,
      ingredient_name,
      strength_value,
      strength_unit,
      manufacturer,
      english_name,
      image_path,
      product_image,
      fallback_image,
      image_type,
      image_source_name,
      image_source_url,
      search_keywords,
      official_match_status,
      registration_method,
      schedule,
      scheduled_time,
      active,
      deactivated_at,
      created_at,
      updated_at
    )
    select
      medication.id,
      v_user_id,
      medication.catalog_id,
      medication.display_label,
      medication.name,
      medication.ingredient_name,
      medication.strength_value,
      medication.strength_unit,
      medication.manufacturer,
      medication.english_name,
      medication.image_path,
      medication.product_image,
      medication.fallback_image,
      medication.image_type,
      medication.image_source_name,
      medication.image_source_url,
      medication.search_keywords,
      medication.official_match_status,
      medication.registration_method,
      medication.schedule,
      medication.scheduled_time,
      coalesce(medication.active, true),
      medication.deactivated_at,
      medication.created_at,
      coalesce(medication.updated_at, medication.deactivated_at, medication.created_at)
    from jsonb_to_recordset(v_new_medications) as medication(
      id text,
      catalog_id text,
      display_label text,
      name text,
      ingredient_name text,
      strength_value double precision,
      strength_unit text,
      manufacturer text,
      english_name text,
      image_path text,
      product_image text,
      fallback_image text,
      image_type text,
      image_source_name text,
      image_source_url text,
      search_keywords text[],
      official_match_status text,
      registration_method text,
      schedule text,
      scheduled_time time without time zone,
      active boolean,
      deactivated_at timestamptz,
      created_at timestamptz,
      updated_at timestamptz
    )
    returning 1
  )
  select pg_catalog.count(*)::integer
  into v_inserted_medication_count
  from inserted_medications;

  with migration_candidates as (
    select distinct on (intake.medication_id, intake.intake_date)
      intake.medication_id,
      intake.intake_date::date as intake_date,
      intake.recorded_at::timestamptz as recorded_at
    from jsonb_to_recordset(v_valid_intakes) as intake(
      medication_id text,
      intake_date text,
      recorded_at text
    )
    order by intake.medication_id, intake.intake_date, intake.recorded_at
  ),
  existing_intakes as (
    select 1
    from migration_candidates
    where exists (
      select 1
      from public.medication_intake_records
      where user_id = v_user_id
        and medication_id = migration_candidates.medication_id
        and intake_date = migration_candidates.intake_date
    )
  ),
  inserted_intakes as (
    insert into public.medication_intake_records (
      user_id,
      medication_id,
      intake_date,
      recorded_at
    )
    select
      v_user_id,
      medication_id,
      intake_date,
      recorded_at
    from migration_candidates
    on conflict (user_id, medication_id, intake_date) do nothing
    returning 1
  )
  select
    (select pg_catalog.count(*)::integer from inserted_intakes),
    (select pg_catalog.count(*)::integer from existing_intakes)
  into v_inserted_intake_count, v_existing_intake_count;

  insert into public.guest_dataset_claims (dataset_id, user_id)
  values (p_dataset_id, v_user_id);

  return query
  select
    true,
    true,
    v_inserted_medication_count,
    v_reused_medication_count,
    v_inserted_intake_count,
    v_existing_intake_count,
    '[]'::jsonb,
    null::text;
end;
$$;

revoke all on function public.merge_guest_medication_dataset(text, jsonb, jsonb) from public;
revoke all on function public.merge_guest_medication_dataset(text, jsonb, jsonb) from anon;
grant execute on function public.merge_guest_medication_dataset(text, jsonb, jsonb) to authenticated;
