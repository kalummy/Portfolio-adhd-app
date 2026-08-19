create table public.mood_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  mood_date date not null,
  mood text not null check (
    mood in ('good', 'lethargic', 'lethargic-depressed', 'poor-condition', 'irritable')
  ),
  recorded_at timestamptz not null,
  summary text not null check (
    pg_catalog.char_length(pg_catalog.btrim(summary)) between 1 and 300
  ),
  primary key (user_id, mood_date)
);

alter table public.mood_records enable row level security;

revoke all on table public.mood_records from public, anon, authenticated;
grant select, insert, update, delete on table public.mood_records to authenticated;

create policy "Users can read their own mood records"
on public.mood_records
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their own mood records"
on public.mood_records
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own mood records"
on public.mood_records
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own mood records"
on public.mood_records
for delete
to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.merge_guest_dataset(
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
  v_visit_id text;
  v_visit_date_text text;
  v_visit_date date;
  v_created_at_text text;
  v_updated_at_text text;
  v_server_visit_date date;
  v_server_visit_updated_at timestamptz;
  v_guest_visit_is_newer boolean := false;
  v_inserted_visit_count integer := 0;
  v_reused_visit_count integer := 0;
  v_inserted_mood_count integer := 0;
  v_existing_mood_count integer := 0;
  v_conflicts jsonb := '[]'::jsonb;
  v_valid_moods jsonb := '[]'::jsonb;
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

  if p_medications is null or pg_catalog.jsonb_typeof(p_medications) <> 'array' then
    return query
    select false, false, 0, 0, 0, 0, 0, 0, 0, 0, '[]'::jsonb, 'invalid_medications_payload';
    return;
  end if;

  if p_intakes is null or pg_catalog.jsonb_typeof(p_intakes) <> 'array' then
    return query
    select false, false, 0, 0, 0, 0, 0, 0, 0, 0, '[]'::jsonb, 'invalid_intakes_payload';
    return;
  end if;

  if p_visit is not null and pg_catalog.jsonb_typeof(p_visit) <> 'object' then
    return query
    select false, false, 0, 0, 0, 0, 0, 0, 0, 0,
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'code', 'invalid_guest_visit',
        'message', 'Guest visit must be a JSON object or null.'
      )),
      'invalid_visit_payload';
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

  if p_visit is not null then
    v_visit_id := p_visit ->> 'visit_id';
    v_visit_date_text := p_visit ->> 'visit_date';
    v_created_at_text := p_visit ->> 'created_at';
    v_updated_at_text := p_visit ->> 'updated_at';

    if v_visit_id is distinct from 'upcoming'
      or v_visit_date_text is null
      or v_visit_date_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or not pg_catalog.pg_input_is_valid(v_visit_date_text, 'date')
      or pg_catalog.to_char(v_visit_date_text::date, 'YYYY-MM-DD') <> v_visit_date_text
      or v_created_at_text is null
      or not pg_catalog.pg_input_is_valid(v_created_at_text, 'timestamp with time zone')
      or v_updated_at_text is null
      or not pg_catalog.pg_input_is_valid(v_updated_at_text, 'timestamp with time zone') then
      return query
      select false, false, 0, 0, 0, 0, 0, 0, 0, 0,
        pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
          'code', 'invalid_guest_visit',
          'message', 'Guest visit has invalid id, date, createdAt, or updatedAt fields.'
        )),
        'invalid_guest_visit';
      return;
    end if;

    v_visit_date := v_visit_date_text::date;

    select visit_date, updated_at
    into v_server_visit_date, v_server_visit_updated_at
    from public.visit_schedules
    where user_id = v_user_id
      and visit_id = 'upcoming';

    if found then
      v_reused_visit_count := 1;
      v_guest_visit_is_newer := v_server_visit_date <> v_visit_date
        and v_updated_at_text::timestamptz > v_server_visit_updated_at;
    end if;
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'code', 'duplicate_guest_mood_date',
      'message', 'Guest mood dates must be unique.'
    )),
    '[]'::jsonb
  )
  into v_conflicts
  from (
    select mood_date
    from pg_catalog.jsonb_to_recordset(p_moods) as mood_record(mood_date text)
    where mood_date is not null and pg_catalog.btrim(mood_date) <> ''
    group by mood_date
    having pg_catalog.count(*) > 1
  ) duplicate_moods;

  if pg_catalog.jsonb_array_length(v_conflicts) > 0 then
    return query
    select false, false, 0, 0, 0, 0, 0, 0, 0, 0, v_conflicts, 'mood_conflict';
    return;
  end if;

  for v_mood in
    select *
    from pg_catalog.jsonb_to_recordset(p_moods) as mood_record(
      mood_date text,
      mood text,
      recorded_at text,
      summary text
    )
  loop
    if v_mood.mood_date is null
      or v_mood.mood_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or not pg_catalog.pg_input_is_valid(v_mood.mood_date, 'date')
      or pg_catalog.to_char(v_mood.mood_date::date, 'YYYY-MM-DD') <> v_mood.mood_date
      or v_mood.mood not in ('good', 'lethargic', 'lethargic-depressed', 'poor-condition', 'irritable')
      or v_mood.recorded_at is null
      or not pg_catalog.pg_input_is_valid(v_mood.recorded_at, 'timestamp with time zone')
      or v_mood.summary is null
      or pg_catalog.char_length(pg_catalog.btrim(v_mood.summary)) not between 1 and 300 then
      v_conflicts := v_conflicts || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'code', 'invalid_guest_mood',
        'message', 'Guest mood has invalid date, category, recordedAt, or summary.'
      ));
      continue;
    end if;

    v_valid_moods := v_valid_moods || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'mood_date', v_mood.mood_date,
        'mood', v_mood.mood,
        'recorded_at', v_mood.recorded_at,
        'summary', pg_catalog.btrim(v_mood.summary)
      )
    );
  end loop;

  if pg_catalog.jsonb_array_length(v_conflicts) > 0 then
    return query
    select false, false, 0, 0, 0, 0, 0, 0, 0, 0, v_conflicts, 'guest_dataset_conflict';
    return;
  end if;

  begin
    select *
    into v_merge
    from public.merge_guest_medication_dataset(
      p_dataset_id,
      p_medications,
      p_intakes
    );
  exception
    when unique_violation then
      return query
      select false, false, 0, 0, 0, 0, 0, 0, 0, 0,
        pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
          'code', 'dataset_claimed_by_another_user',
          'message', 'Guest dataset is already claimed by another user.'
        )),
        'dataset_claimed_by_another_user';
      return;
  end;

  if not v_merge.success then
    return query
    select
      false,
      false,
      v_merge.inserted_medication_count,
      v_merge.reused_medication_count,
      v_merge.inserted_intake_count,
      v_merge.existing_intake_count,
      0,
      0,
      0,
      0,
      v_merge.conflicts,
      v_merge.failure_reason;
    return;
  end if;

  if p_visit is not null and v_reused_visit_count = 0 then
    insert into public.visit_schedules (
      user_id,
      visit_id,
      visit_date,
      created_at,
      updated_at
    ) values (
      v_user_id,
      'upcoming',
      v_visit_date,
      v_created_at_text::timestamptz,
      v_updated_at_text::timestamptz
    );
    v_inserted_visit_count := 1;
  elsif p_visit is not null and v_guest_visit_is_newer then
    update public.visit_schedules
    set
      visit_date = v_visit_date,
      updated_at = v_updated_at_text::timestamptz
    where user_id = v_user_id
      and visit_id = 'upcoming';
  end if;

  with migration_candidates as (
    select
      mood_record.mood_date::date as mood_date,
      mood_record.mood,
      mood_record.recorded_at::timestamptz as recorded_at,
      mood_record.summary
    from pg_catalog.jsonb_to_recordset(v_valid_moods) as mood_record(
      mood_date text,
      mood text,
      recorded_at text,
      summary text
    )
  ),
  existing_moods as (
    select 1
    from migration_candidates
    where exists (
      select 1
      from public.mood_records
      where user_id = v_user_id
        and mood_date = migration_candidates.mood_date
    )
  ),
  inserted_moods as (
    insert into public.mood_records (
      user_id,
      mood_date,
      mood,
      recorded_at,
      summary
    )
    select
      v_user_id,
      mood_date,
      mood,
      recorded_at,
      summary
    from migration_candidates
    on conflict (user_id, mood_date) do nothing
    returning 1
  )
  select
    (select pg_catalog.count(*)::integer from inserted_moods),
    (select pg_catalog.count(*)::integer from existing_moods)
  into v_inserted_mood_count, v_existing_mood_count;

  return query
  select
    true,
    true,
    v_merge.inserted_medication_count,
    v_merge.reused_medication_count,
    v_merge.inserted_intake_count,
    v_merge.existing_intake_count,
    v_inserted_visit_count,
    v_reused_visit_count,
    v_inserted_mood_count,
    v_existing_mood_count,
    '[]'::jsonb,
    v_merge.failure_reason;
end;
$$;

revoke all on function public.merge_guest_dataset(text, jsonb, jsonb, jsonb, jsonb) from public;
revoke all on function public.merge_guest_dataset(text, jsonb, jsonb, jsonb, jsonb) from anon;
revoke all on function public.merge_guest_dataset(text, jsonb, jsonb, jsonb, jsonb) from service_role;
grant execute on function public.merge_guest_dataset(text, jsonb, jsonb, jsonb, jsonb) to authenticated;
