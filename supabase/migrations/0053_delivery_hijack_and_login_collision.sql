-- Provisio / Freshline — critical fix from a fresh audit pass: a courier
-- could hijack any order in the system.
--
-- "courier update own deliveries" (0002_roles_auth.sql) is
--   for update using (driver_id = current_driver_id())
-- with no explicit WITH CHECK — Postgres defaults WITH CHECK to the same
-- expression as USING when one isn't given, so it only pins driver_id to
-- stay the caller's own id; every OTHER column, including order_id, was
-- freely rewritable. Exploit: a courier with at least one delivery ever
-- assigned to them runs
--   update deliveries set order_id = '<victim order>' where id = '<their own delivery>'
-- — passes RLS (driver_id unchanged). Their "select assigned orders"/
-- order_items policies and the "courier select customers on own
-- deliveries" policy (0004_courier_delivery_sync.sql) now match through
-- that delivery, exposing the victim order's contents/price and the
-- victim customer's name/phone/address. Following up with
--   update deliveries set status = 'delivered' where id = '<their own delivery>'
-- fires sync_order_status_from_delivery() (0004, security definer),
-- forging "delivered" on the victim's order — bypassing orders' RLS
-- entirely — and firing the real customer's delivery push notification.
--
-- Fix: a guard trigger, same shape as guard_customer_privileged_fields —
-- a non-admin can update a delivery's status/eta/address (all the courier
-- app ever writes, per lib/services/courier_service.dart) but never its
-- order_id or driver_id.
create or replace function guard_delivery_privileged_fields() returns trigger as $$
begin
  if not is_admin() then
    if new.order_id is distinct from old.order_id then
      raise exception 'only an admin can reassign a delivery to a different order';
    end if;
    if new.driver_id is distinct from old.driver_id then
      raise exception 'only an admin can reassign a delivery to a different courier';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists deliveries_guard_privileged_fields on deliveries;
create trigger deliveries_guard_privileged_fields
  before update on deliveries
  for each row execute function guard_delivery_privileged_fields();

-- ---------------------------------------------------------------------------
-- Medium finding, same pass: `login` (0018_login_field.sql) is unique only
-- within customers or within drivers separately, never across both — and
-- 0035_driver_profile_guard.sql deliberately leaves a courier free to
-- rename their own login. check_login_lock/record_login_result (0044)
-- match by login across BOTH tables. A courier who learns a customer's
-- login could rename their own to match it, then fail sign-in 3 times on
-- purpose to lock the customer's account. Fix at the source: never allow
-- a login value that's already in use on the other table.
-- ---------------------------------------------------------------------------
create or replace function prevent_cross_table_login_collision() returns trigger as $$
begin
  if new.login is not null then
    if tg_table_name = 'customers' then
      if exists (select 1 from drivers where lower(login) = lower(new.login)) then
        raise exception 'this login is already in use';
      end if;
    else
      if exists (select 1 from customers where lower(login) = lower(new.login)) then
        raise exception 'this login is already in use';
      end if;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists customers_prevent_login_collision on customers;
create trigger customers_prevent_login_collision
  before insert or update of login on customers
  for each row execute function prevent_cross_table_login_collision();

drop trigger if exists drivers_prevent_login_collision on drivers;
create trigger drivers_prevent_login_collision
  before insert or update of login on drivers
  for each row execute function prevent_cross_table_login_collision();

-- ---------------------------------------------------------------------------
-- Low finding, same pass: push_token_add/push_token_remove
-- (0017_multi_device_push.sql) were callable by anon (checked live —
-- `revoke all ... from public` alone did NOT remove it here, unlike every
-- other function this same fix was applied to elsewhere in this schema;
-- anon apparently held a grant on these two specifically that wasn't
-- coming from the PUBLIC pseudo-role, cause unconfirmed. Naming anon
-- explicitly in the revoke — not just "from public" — is the more robust
-- habit regardless). Both already scope every write by auth.uid(), which
-- is null for a true anonymous caller, so this was a no-op for anon
-- rather than exploitable — closing for consistency/defense-in-depth.
-- ---------------------------------------------------------------------------
revoke all on function public.push_token_add(text) from public, anon, authenticated;
revoke all on function public.push_token_remove(text) from public, anon, authenticated;
grant execute on function public.push_token_add(text) to authenticated;
grant execute on function public.push_token_remove(text) to authenticated;
