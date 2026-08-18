create table public.user_medications (
  id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  catalog_id text,
  display_label text,
  name text not null,
  ingredient_name text,
  strength_value double precision not null,
  strength_unit text not null,
  manufacturer text,
  english_name text,
  image_path text not null,
  product_image text,
  fallback_image text,
  image_type text,
  image_source_name text,
  image_source_url text,
  search_keywords text[],
  official_match_status text,
  registration_method text not null,
  schedule text not null,
  active boolean not null default true,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  constraint user_medications_strength_unit_check check (strength_unit = 'mg'),
  constraint user_medications_image_type_check check (image_type is null or image_type in ('product', 'fallback')),
  constraint user_medications_official_match_status_check check (
    official_match_status is null
    or official_match_status in ('matched', 'not-found', 'ambiguous', 'unavailable')
  ),
  constraint user_medications_registration_method_check check (
    registration_method in ('search', 'manual', 'photo')
  ),
  constraint user_medications_schedule_check check (schedule in ('daily', 'as-needed', 'bedtime'))
);

create index user_medications_active_created_at_idx
on public.user_medications (user_id, created_at)
where active = true;

alter table public.user_medications enable row level security;

revoke all on table public.user_medications from anon;
grant select, insert, update, delete on table public.user_medications to authenticated;

create policy "Users can read their own medications"
on public.user_medications
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their own medications"
on public.user_medications
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own medications"
on public.user_medications
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own medications"
on public.user_medications
for delete
to authenticated
using ((select auth.uid()) = user_id);
