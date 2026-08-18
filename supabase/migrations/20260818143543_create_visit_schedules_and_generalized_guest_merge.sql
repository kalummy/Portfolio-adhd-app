create table public.visit_schedules (
  user_id uuid not null references auth.users(id) on delete cascade,
  visit_id text not null,
  visit_date date not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (user_id, visit_id),
  constraint visit_schedules_visit_id_check check (visit_id = 'upcoming')
);

create index visit_schedules_user_visit_date_idx
on public.visit_schedules (user_id, visit_date);

alter table public.visit_schedules enable row level security;

revoke all on table public.visit_schedules from public, anon, authenticated;
grant select, insert, update, delete on table public.visit_schedules to authenticated;

create policy "Users can read their own visit schedules"
on public.visit_schedules
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their own visit schedules"
on public.visit_schedules
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own visit schedules"
on public.visit_schedules
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own visit schedules"
on public.visit_schedules
for delete
to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.merge_guest_dataset(
  p_dataset_id text,
  p_medications jsonb,
  p_intakes jsonb,
  p_visit jsonb
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
  v_inserted_visit_count integer := 0;
  v_reused_visit_count integer := 0;
  v_merge record;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_dataset_id is null or pg_catalog.btrim(p_dataset_id) = '' then
    return query
    select false, false, 0, 0, 0, 0, 0, 0, '[]'::jsonb, 'invalid_dataset_id';
    return;
  end if;

  if p_medications is null or pg_catalog.jsonb_typeof(p_medications) <> 'array' then
    return query
    select false, false, 0, 0, 0, 0, 0, 0, '[]'::jsonb, 'invalid_medications_payload';
    return;
  end if;

  if p_intakes is null or pg_catalog.jsonb_typeof(p_intakes) <> 'array' then
    return query
    select false, false, 0, 0, 0, 0, 0, 0, '[]'::jsonb, 'invalid_intakes_payload';
    return;
  end if;

  if p_visit is not null and pg_catalog.jsonb_typeof(p_visit) <> 'object' then
    return query
    select false, false, 0, 0, 0, 0, 0, 0,
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'code', 'invalid_guest_visit',
        'message', 'Guest visit must be a JSON object or null.'
      )),
      'invalid_visit_payload';
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
      select false, false, 0, 0, 0, 0, 0, 0,
        pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
          'code', 'invalid_guest_visit',
          'message', 'Guest visit has invalid id, date, createdAt, or updatedAt fields.'
        )),
        'invalid_guest_visit';
      return;
    end if;

    v_visit_date := v_visit_date_text::date;

    select visit_date
    into v_server_visit_date
    from public.visit_schedules
    where user_id = v_user_id
      and visit_id = 'upcoming';

    if found then
      if v_server_visit_date <> v_visit_date then
        return query
        select false, false, 0, 0, 0, 0, 0, 0,
          pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
            'code', 'visit_date_conflict',
            'message', 'Server and guest upcoming visit dates differ.'
          )),
          'guest_dataset_conflict';
        return;
      end if;

      v_reused_visit_count := 1;
    end if;
  end if;

  select *
  into v_merge
  from public.merge_guest_medication_dataset(
    p_dataset_id,
    p_medications,
    p_intakes
  );

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
  end if;

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
    '[]'::jsonb,
    v_merge.failure_reason;
end;
$$;

revoke all on function public.merge_guest_dataset(text, jsonb, jsonb, jsonb) from public;
revoke all on function public.merge_guest_dataset(text, jsonb, jsonb, jsonb) from anon;
grant execute on function public.merge_guest_dataset(text, jsonb, jsonb, jsonb) to authenticated;
