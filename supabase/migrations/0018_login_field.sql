-- Freshline — sign in by a plain admin-assigned "login" (username) instead
-- of requiring the shopper/courier to type their email.
--
-- login stays nullable and doesn't replace email — self-registered
-- customers (no login set yet) can still type their email in the same
-- field; resolve_login_email() below falls back to treating the input as
-- an email if no login matches.

alter table customers add column if not exists login text unique;
alter table drivers add column if not exists login text unique;

-- Callable by anon: the whole point is looking this up *before* the caller
-- has a session. Security definer so it can read auth.users/customers/
-- drivers regardless of the (anonymous) caller's own RLS visibility —
-- returns only the one email string, nothing else about the account.
create or replace function public.resolve_login_email(p_login text) returns text
language plpgsql security definer stable set search_path = public as $$
declare
  found_email text;
begin
  select au.email into found_email
  from auth.users au
  join customers c on c.auth_user_id = au.id
  where lower(c.login) = lower(p_login)
  limit 1;
  if found_email is not null then
    return found_email;
  end if;

  select au.email into found_email
  from auth.users au
  join drivers d on d.auth_user_id = au.id
  where lower(d.login) = lower(p_login)
  limit 1;
  if found_email is not null then
    return found_email;
  end if;

  -- No login matches — treat the input as a plain email instead (covers
  -- every account created before this feature existed, or one an admin
  -- never bothered giving a separate login).
  return p_login;
end;
$$;

grant execute on function public.resolve_login_email(text) to anon, authenticated;
