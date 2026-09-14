-- Provisio — admin_users (0002_roles_auth.sql) never had Row Level Security
-- enabled in the migration history. is_admin()/current_customer_id() etc.
-- are security definer so the app itself never needed direct table access,
-- but without RLS the table falls back to plain grants — meaning a fresh
-- database built from these migrations alone (a new environment, a reset,
-- a restore) would leave the list of who's an admin fully readable (and
-- possibly writable) by anyone with the public anon key. The live project
-- currently returns zero rows to an anonymous request, so this looks to
-- have already been enabled by hand in the dashboard at some point — this
-- migration just brings the tracked schema in line with that, so rebuilding
-- from scratch doesn't silently reopen it.
alter table admin_users enable row level security;

drop policy if exists "admin select own row" on admin_users;
create policy "admin select own row" on admin_users for select
  using (auth_user_id = auth.uid());

-- No insert/update/delete policy for anyone — becoming an admin stays a
-- manual SQL-editor action (see 0002's bootstrap note) or goes through the
-- service-role create-account edge function, exactly as before.
