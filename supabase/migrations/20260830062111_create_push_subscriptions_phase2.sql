create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint push_subscriptions_endpoint_length_check
    check (char_length(endpoint) between 16 and 4096),
  constraint push_subscriptions_p256dh_length_check
    check (char_length(p256dh) between 16 and 512),
  constraint push_subscriptions_auth_length_check
    check (char_length(auth) between 8 and 256)
);

create index push_subscriptions_user_active_idx
on public.push_subscriptions (user_id, updated_at desc)
where revoked_at is null;

alter table public.push_subscriptions enable row level security;

revoke all on table public.push_subscriptions from public, anon, authenticated;
grant select, delete on table public.push_subscriptions to authenticated;
grant select, insert, update, delete on table public.push_subscriptions to service_role;

create policy "Users can read their own push subscriptions"
on public.push_subscriptions
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can delete their own push subscriptions"
on public.push_subscriptions
for delete
to authenticated
using ((select auth.uid()) = user_id);
