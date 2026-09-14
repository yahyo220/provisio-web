-- Provisio / Freshline — lock an account after 3 failed sign-in attempts;
-- only an admin can unlock it (website). Closes the enumeration issue
-- resolve_login_email (0018) has on its own — even if someone tries every
-- login in sequence, they get locked out after 3 wrong passwords per
-- account instead of being able to keep probing indefinitely.
--
-- The actual password check happens in Supabase Auth (GoTrue), outside this
-- database, so counting failures has to be driven by whatever calls
-- signInWithPassword — see supabase/functions/login, which wraps that call
-- and reports the result here via record_login_result(). The app's own
-- direct auth.signInWithPassword() call (auth_service.dart) is being
-- replaced by a call to that function so this is actually enforced,
-- not just decorative.

alter table customers add column if not exists failed_login_attempts integer not null default 0;
alter table customers add column if not exists login_locked_at timestamptz;
alter table drivers add column if not exists failed_login_attempts integer not null default 0;
alter table drivers add column if not exists login_locked_at timestamptz;

create or replace function public.check_login_lock(p_login text) returns boolean
language plpgsql security definer stable set search_path = public as $$
declare
  v_locked boolean;
begin
  select (login_locked_at is not null) into v_locked
  from customers where lower(login) = lower(p_login) or lower(email) = lower(p_login);
  if v_locked then return true; end if;

  select (login_locked_at is not null) into v_locked
  from drivers where lower(login) = lower(p_login);
  return coalesce(v_locked, false);
end;
$$;

-- Called once per sign-in attempt, after the real password check, with
-- whether it succeeded. Resets the counter on success; on failure, bumps
-- it and locks the account once it reaches 3. Matches by login OR email —
-- same lookup resolve_login_email (0018) already uses.
create or replace function public.record_login_result(p_login text, p_success boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_success then
    update customers set failed_login_attempts = 0
      where (lower(login) = lower(p_login) or lower(email) = lower(p_login)) and login_locked_at is null;
    update drivers set failed_login_attempts = 0
      where lower(login) = lower(p_login) and login_locked_at is null;
  else
    update customers set
      failed_login_attempts = failed_login_attempts + 1,
      login_locked_at = case when failed_login_attempts + 1 >= 3 then now() else login_locked_at end
      where lower(login) = lower(p_login) or lower(email) = lower(p_login);
    update drivers set
      failed_login_attempts = failed_login_attempts + 1,
      login_locked_at = case when failed_login_attempts + 1 >= 3 then now() else login_locked_at end
      where lower(login) = lower(p_login);
  end if;
end;
$$;

revoke all on function public.check_login_lock(text) from public;
revoke all on function public.record_login_result(text, boolean) from public;
grant execute on function public.check_login_lock(text) to anon, authenticated;
grant execute on function public.record_login_result(text, boolean) to anon, authenticated;

-- Protect the new columns the same way approval_status/price_tier/etc.
-- already are — a customer/driver must never be able to clear their own
-- lock by writing to their own row; only an admin (the website's unlock
-- button) can.
create or replace function guard_customer_privileged_fields() returns trigger as $$
begin
  if not is_admin() then
    if tg_op = 'UPDATE' then
      if new.approval_status is distinct from old.approval_status
         or new.price_tier is distinct from old.price_tier
         or new.bank_transfer_enabled is distinct from old.bank_transfer_enabled
         or new.cash_enabled is distinct from old.cash_enabled
         or new.failed_login_attempts is distinct from old.failed_login_attempts
         or new.login_locked_at is distinct from old.login_locked_at then
        raise exception 'only an admin can change approval_status, price_tier, bank_transfer_enabled, cash_enabled, failed_login_attempts, or login_locked_at';
      end if;
    elsif tg_op = 'INSERT' then
      new.approval_status := 'pending';
      new.price_tier := 'no_price';
      new.bank_transfer_enabled := false;
      new.cash_enabled := false;
      new.failed_login_attempts := 0;
      new.login_locked_at := null;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function guard_driver_privileged_fields() returns trigger as $$
begin
  if not is_admin() then
    if new.name is distinct from old.name
       or new.phone is distinct from old.phone
       or new.auth_user_id is distinct from old.auth_user_id
       or new.failed_login_attempts is distinct from old.failed_login_attempts
       or new.login_locked_at is distinct from old.login_locked_at then
      raise exception 'only an admin can change name, phone, auth_user_id, failed_login_attempts, or login_locked_at on a driver';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;
