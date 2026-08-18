create table public.medication_intake_records (
  user_id uuid not null,
  medication_id text not null,
  intake_date date not null,
  recorded_at timestamptz not null,
  primary key (user_id, medication_id, intake_date),
  constraint medication_intake_records_medication_fkey
    foreign key (user_id, medication_id)
    references public.user_medications (user_id, id)
    on delete cascade
);

create index medication_intake_records_user_date_idx
on public.medication_intake_records (user_id, intake_date);

alter table public.medication_intake_records enable row level security;

revoke all on table public.medication_intake_records from public, anon, authenticated;
grant select, insert, delete on table public.medication_intake_records to authenticated;

create policy "Users can read their own medication intake records"
on public.medication_intake_records
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their own medication intake records"
on public.medication_intake_records
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own medication intake records"
on public.medication_intake_records
for delete
to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.migrate_initial_medication_intake_records(
  p_records jsonb
)
returns table (
  migrated boolean,
  inserted_count integer,
  skipped_count integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_input_count integer := 0;
  v_inserted_count integer := 0;
  v_skipped_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_records is null or pg_catalog.jsonb_typeof(p_records) <> 'array' then
    raise exception 'p_records must be a JSON array.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'medication_intake_records_initial_migration:' || v_user_id::text,
      0
    )
  );

  with raw_records as (
    select
      entry.value ->> 'medication_id' as medication_id,
      entry.value ->> 'intake_date' as intake_date_text,
      entry.value ->> 'recorded_at' as recorded_at_text,
      entry.value ->> 'taken' as taken_text
    from pg_catalog.jsonb_array_elements(p_records) as entry(value)
  ),
  normalized_records as (
    select
      medication_id,
      intake_date_text,
      recorded_at_text,
      taken_text,
      case
        when pg_catalog.pg_input_is_valid(
          intake_date_text,
          'date'
        ) then intake_date_text::pg_catalog.date
      end as intake_date,
      case
        when pg_catalog.pg_input_is_valid(
          recorded_at_text,
          'timestamp with time zone'
        ) then recorded_at_text::pg_catalog.timestamptz
      end as recorded_at
    from raw_records
  ),
  valid_records as (
    select normalized_records.*
    from normalized_records
    where taken_text = 'true'
      and medication_id is not null
      and medication_id <> ''
      and intake_date_text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      and intake_date is not null
      and pg_catalog.to_char(intake_date, 'YYYY-MM-DD') = intake_date_text
      and recorded_at is not null
      and exists (
        select 1
        from public.user_medications
        where user_id = v_user_id
          and id = normalized_records.medication_id
      )
  ),
  migration_candidates as (
    select distinct on (medication_id, intake_date)
      medication_id,
      intake_date,
      recorded_at
    from valid_records
    order by medication_id, intake_date, recorded_at
  ),
  inserted_records as (
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
    (select pg_catalog.count(*)::integer from raw_records),
    (select pg_catalog.count(*)::integer from inserted_records),
    (
      (select pg_catalog.count(*)::integer from raw_records)
      - (select pg_catalog.count(*)::integer from valid_records)
    )
  into v_input_count, v_inserted_count, v_skipped_count;

  return query
  select v_input_count > 0, v_inserted_count, v_skipped_count;
end;
$$;

revoke all on function public.migrate_initial_medication_intake_records(jsonb) from public;
revoke all on function public.migrate_initial_medication_intake_records(jsonb) from anon;
grant execute on function public.migrate_initial_medication_intake_records(jsonb) to authenticated;
