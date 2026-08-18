revoke all privileges on table public.profiles from anon, authenticated;
grant select, insert, update, delete on table public.profiles to authenticated;
