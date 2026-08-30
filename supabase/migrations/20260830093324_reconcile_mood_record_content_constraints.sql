do $migration$
declare
  v_details_non_object_count bigint;
  v_clinic_phrase_blank_count bigint;
  v_clinic_phrase_over_300_count bigint;
begin
  select
    pg_catalog.count(*) filter (
      where details is not null
        and pg_catalog.jsonb_typeof(details) <> 'object'
    ),
    pg_catalog.count(*) filter (
      where clinic_phrase is not null
        and pg_catalog.char_length(pg_catalog.btrim(clinic_phrase)) = 0
    ),
    pg_catalog.count(*) filter (
      where clinic_phrase is not null
        and pg_catalog.char_length(pg_catalog.btrim(clinic_phrase)) > 300
    )
  into
    v_details_non_object_count,
    v_clinic_phrase_blank_count,
    v_clinic_phrase_over_300_count
  from public.mood_records;

  if v_details_non_object_count > 0
    or v_clinic_phrase_blank_count > 0
    or v_clinic_phrase_over_300_count > 0
  then
    raise exception
      'mood_records constraint preflight failed: details_non_object=%, clinic_phrase_blank=%, clinic_phrase_over_300=%',
      v_details_non_object_count,
      v_clinic_phrase_blank_count,
      v_clinic_phrase_over_300_count
      using errcode = '23514';
  end if;
end
$migration$;

alter table public.mood_records
  drop constraint if exists mood_records_details_is_object,
  drop constraint if exists mood_records_clinic_phrase_length;

alter table public.mood_records
  add constraint mood_records_details_is_object
    check (
      details is null
      or pg_catalog.jsonb_typeof(details) = 'object'
    )
    not valid,
  add constraint mood_records_clinic_phrase_length
    check (
      clinic_phrase is null
      or pg_catalog.char_length(pg_catalog.btrim(clinic_phrase)) between 1 and 300
    )
    not valid;

alter table public.mood_records
  validate constraint mood_records_details_is_object,
  validate constraint mood_records_clinic_phrase_length;
