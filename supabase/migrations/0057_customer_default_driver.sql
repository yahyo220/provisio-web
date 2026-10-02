-- Freshline / Provisio — a client can have a default courier ("Доставщик" in
-- Данные компании). Every new order from that client — or from any of their
-- linked staff — gets its delivery created already assigned to that courier,
-- so nobody has to pick one by hand for each order. Orders that already
-- exist, and manual re-assignment on the Deliveries page, are untouched.
--
-- company_root_id is re-declared (identical to 0054/0056) so this file
-- doesn't depend on those having run first.

create or replace function company_root_id(p_customer_id uuid) returns uuid as $$
  select coalesce(parent_customer_id, id) from customers where id = p_customer_id;
$$ language sql security definer stable set search_path = public;

alter table customers add column if not exists default_driver_id uuid references drivers(id) on delete set null;
create index if not exists customers_default_driver_id_idx on customers (default_driver_id) where default_driver_id is not null;

-- Only an admin may pick a client's courier — a customer can update their own
-- row (RLS), so without this they could point their own orders at any courier.
-- Same function as 0055 (which already trusts service_role), plus the new column.
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
         or new.parent_customer_id is distinct from old.parent_customer_id
         or new.default_driver_id is distinct from old.default_driver_id then
        raise exception 'only an admin can change approval_status, price_tier, bank_transfer_enabled, cash_enabled, failed_login_attempts, login_locked_at, parent_customer_id, or default_driver_id';
      end if;
    elsif tg_op = 'INSERT' then
      new.approval_status := 'pending';
      new.price_tier := 'no_price';
      new.bank_transfer_enabled := false;
      new.cash_enabled := false;
      new.failed_login_attempts := 0;
      new.login_locked_at := null;
      new.parent_customer_id := null;
      new.default_driver_id := null;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- 0005's trigger function, now also assigning the company's default courier.
-- The delivery insert fires the same "delivery assigned" push to that courier
-- as a manual assignment does.
create or replace function create_delivery_for_order() returns trigger as $$
declare
  v_driver_id uuid;
begin
  select c.default_driver_id into v_driver_id
  from customers c
  where c.id = company_root_id(new.customer_id);

  insert into deliveries (order_id, address, status, driver_id)
  values (new.id, new.delivery_address, 'scheduled', v_driver_id);
  return new;
end;
$$ language plpgsql security definer set search_path = public;
