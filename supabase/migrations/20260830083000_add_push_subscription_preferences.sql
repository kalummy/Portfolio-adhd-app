alter table public.push_subscriptions
  add column if not exists medication_enabled boolean not null default true,
  add column if not exists visit_day_enabled boolean not null default true,
  add column if not exists mood_enabled boolean not null default true;

comment on column public.push_subscriptions.medication_enabled
  is 'Whether medication pushes are enabled for this browser subscription.';
comment on column public.push_subscriptions.visit_day_enabled
  is 'Whether visit-day pushes are enabled for this browser subscription.';
comment on column public.push_subscriptions.mood_enabled
  is 'Whether mood-report pushes are enabled for this browser subscription.';
