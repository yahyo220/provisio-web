-- Provisio / Freshline — critical security fixes, batch 1 (audit findings).
--
-- Three independent holes found in a full-codebase security audit, bundled
-- into one migration the same way 531c803's five-fix batch was:
--
-- 1) orders INSERT: "customer insert own orders" (0002_roles_auth.sql) only
--    ever checked customer_id/approval_status — status, payment, paid_at,
--    and payment_method were all trusted verbatim from the client. A
--    modified client (or a plain REST call using a real customer's
--    session) could insert an order with payment='paid', status=
--    'delivered', or a payment_method the admin never granted (0022/0033
--    gate cash/transfer behind an explicit per-customer flag, but nothing
--    ever enforced that at order-insert time) — the exact same class of
--    bug 0042_enforce_order_item_price.sql already fixed for
--    order_items.unit_price, just one level up on the parent row.
--
-- 2) record_login_result/check_login_lock (0044) were granted execute to
--    anon/authenticated so the login edge function (which only holds the
--    public anon key) could call them — but that means anyone can call
--    them directly too, with no real login attempt behind it. Three bogus
--    rpc('record_login_result', {p_login:'victim@x', p_success:false})
--    calls permanently locks any customer/driver account — an
--    unauthenticated denial-of-service against the whole customer base.
--
-- 3) signUp() (app's auth_service.dart) only inserted the customers row
--    when Supabase Auth returned a session immediately. If the project
--    requires email confirmation, signUp() gets no session and never
--    inserts that row — nothing else ever creates it afterwards, so the
--    person confirms their email, can sign in fine (auth.users exists),
--    but the app finds no matching customers row and gets stuck on
--    "account not found" forever, with no self-service recovery.

-- ---------------------------------------------------------------------------
-- 1) orders insert guard
-- ---------------------------------------------------------------------------
create or replace function enforce_order_insert_guards() returns trigger as $$
declare
  v_cash_enabled boolean;
  v_bank_transfer_enabled boolean;
begin
  if is_admin() then
    return new;
  end if;

  -- Real-world progress the business controls, never the client.
  new.status := 'new';
  new.payment := 'pending';
  new.paid_at := null;
  -- No variable delivery fee exists today (the app always sends 0) — force
  -- it anyway so tampering here can never do anything even if that changes.
  new.delivery_fee := 0;

  select cash_enabled, bank_transfer_enabled into v_cash_enabled, v_bank_transfer_enabled
  from customers where id = new.customer_id;

  if new.payment_method = 'cash' then
    if not coalesce(v_cash_enabled, false) then
      raise exception 'cash payment is not enabled for this customer';
    end if;
  elsif new.payment_method = 'transfer' then
    if not coalesce(v_bank_transfer_enabled, false) then
      raise exception 'bank transfer is not enabled for this customer';
    end if;
  else
    raise exception 'invalid payment_method: %', new.payment_method;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists orders_enforce_insert_guards on orders;
create trigger orders_enforce_insert_guards
  before insert on orders
  for each row execute function enforce_order_insert_guards();

-- ---------------------------------------------------------------------------
-- 2) lock the lockout RPCs down to service_role; the login edge function
--    switches to a service-role client for just these two calls (see
--    supabase/functions/login/index.ts).
-- ---------------------------------------------------------------------------
revoke execute on function public.check_login_lock(text) from anon, authenticated;
revoke execute on function public.record_login_result(text, boolean) from anon, authenticated;
grant execute on function public.check_login_lock(text) to service_role;
grant execute on function public.record_login_result(text, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- 3) create the customers row from an auth.users trigger instead of a
--    client-side insert, so it happens regardless of email-confirmation
--    settings. Gated on a 'mb_self_signup' flag in raw_user_meta_data (set
--    by the app's signUp() call) so this never fires for admin-created
--    accounts (create-account edge function already inserts its own
--    customers/drivers row explicitly, for both couriers and customers).
-- ---------------------------------------------------------------------------
create or replace function handle_new_self_signup() returns trigger as $$
declare
  v_person_name text;
  v_company text;
  v_login text;
begin
  if not (new.raw_user_meta_data ? 'mb_self_signup') then
    return new;
  end if;

  v_person_name := coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), new.email);
  v_company := nullif(trim(new.raw_user_meta_data->>'company_name'), '');
  v_login := nullif(trim(new.raw_user_meta_data->>'login'), '');

  begin
    insert into public.customers (name, type, contact, phone, email, location, status, auth_user_id, login, staff_role)
    values (
      coalesce(v_company, v_person_name),
      'Частный клиент',
      v_person_name,
      nullif(trim(new.raw_user_meta_data->>'phone'), ''),
      new.email,
      '',
      'active',
      new.id,
      v_login,
      nullif(trim(new.raw_user_meta_data->>'staff_role'), '')
    );
  exception when unique_violation then
    -- Matched verbatim in the app's signUp() error handling.
    raise exception 'login_taken';
  end;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_self_signup on auth.users;
create trigger on_auth_user_self_signup
  after insert on auth.users
  for each row execute function handle_new_self_signup();
