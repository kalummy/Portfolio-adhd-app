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
