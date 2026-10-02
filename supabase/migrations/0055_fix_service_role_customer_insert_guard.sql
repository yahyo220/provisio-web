-- Freshline / Provisio — the real root cause behind staff created via
-- Добавить сотрудника (and really any account created through the
-- create-account edge function) repeatedly reverting to
-- approval_status='pending'/parent_customer_id=null/price_tier='no_price'
-- no matter what that edge function explicitly set on insert.
--
-- guard_customer_privileged_fields() (0002/0047) resets those columns back
-- to their defaults on every INSERT whenever `not is_admin()`. is_admin()
-- checks admin_users against auth.uid() — but create-account's insert runs
-- through a service-role client (SUPABASE_SERVICE_ROLE_KEY), which carries
-- no user JWT at all, so auth.uid() is NULL there and is_admin() always
-- comes back false. The trigger then silently overwrites exactly the
-- fields the edge function had just set correctly — on every single
-- admin-created account, not just staff. The edge function already
-- verifies the caller is a real admin itself (reads admin_users using the
-- caller's own token before touching anything privileged, see
-- supabase/functions/create-account/index.ts) — trusting service_role here
-- only stops the trigger from undoing what that check already allowed.
create or replace function guard_customer_privileged_fields() returns trigger as $$
begin
  if not (is_admin() or auth.role() = 'service_role') then
    if tg_op = 'UPDATE' then
      if new.approval_status is distinct from old.approval_status
         or new.price_tier is distinct from old.price_tier
         or new.bank_transfer_enabled is distinct from old.bank_transfer_enabled
         or new.cash_enabled is distinct from old.cash_enabled
         or new.failed_login_attempts is distinct from old.failed_login_attempts
         or new.login_locked_at is distinct from old.login_locked_at
         or new.parent_customer_id is distinct from old.parent_customer_id then
        raise exception 'only an admin can change approval_status, price_tier, bank_transfer_enabled, cash_enabled, failed_login_attempts, login_locked_at, or parent_customer_id';
      end if;
    elsif tg_op = 'INSERT' then
      new.approval_status := 'pending';
      new.price_tier := 'no_price';
      new.bank_transfer_enabled := false;
      new.cash_enabled := false;
      new.failed_login_attempts := 0;
      new.login_locked_at := null;
      new.parent_customer_id := null;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;
