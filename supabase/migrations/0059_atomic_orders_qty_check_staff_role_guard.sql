-- Freshline / Provisio — three fixes from the 2026-10-11 review.
--
-- 1) place_order(): the app used to insert the order row and its items as two
--    separate requests, fire-and-forget, swallowing every error — a refused
--    order (offline, cash/transfer not enabled, account not approved) still
--    showed "Заказ подтверждён" on the phone, and a failure between the two
--    inserts left an empty order (with a courier already assigned) on the
--    dashboard. This function does both inserts in one transaction, so
--    either the whole order lands or nothing does, and the app now waits for
--    it before confirming. Security invoker: the caller's own RLS policies
--    and the existing triggers (order insert guards, server-side item
--    prices, auto-created delivery) all still apply exactly as before.
--
-- 2) order_items had no check on qty and the customer insert policy didn't
--    look at the order's state — a customer could add a negative-qty line to
--    any of their own old orders (even delivered ones) and shrink their
--    transfer debt. Now qty must be > 0, and a customer may only add lines
--    to their own order while it is still 'new' and just placed (old app
--    versions insert items right after the order, within seconds).
--
-- 3) staff_role wasn't in guard_customer_privileged_fields, and a customer
--    can update their own row — so a linked Повар/Бармен could set
--    themselves to 'Руководитель' and get company-wide order, price and debt
--    visibility (0054/0056). Only an admin may change it now.

-- ---------------------------------------------------------------------------
-- 1) place_order
-- ---------------------------------------------------------------------------
-- The delivery time the shopper picks at checkout ("Как можно скорее",
-- "Завтра, 09:00 – 10:00", …) used to stay on the phone only — the
-- dashboard never saw it. Stored with the order now.
alter table orders add column if not exists delivery_slot text;

create or replace function place_order(p_payment_method text, p_address text, p_items jsonb, p_delivery_slot text default null)
returns json as $$
declare
  v_customer_id uuid := current_customer_id();
  v_order_id uuid;
  v_order_number bigint;
begin
  if v_customer_id is null then
    raise exception 'not_a_customer';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty_order';
  end if;

  insert into orders (customer_id, status, payment, payment_method, delivery_address, delivery_fee, notes, delivery_slot)
  values (v_customer_id, 'new', 'pending', p_payment_method, p_address, 0, '', nullif(trim(p_delivery_slot), ''))
  returning id, order_number into v_order_id, v_order_number;

  -- unit_price is overwritten by enforce_order_item_price (0042) anyway.
  insert into order_items (order_id, product_id, name, sku, qty, unit, unit_price, image_url)
  select v_order_id, i.product_id, coalesce(nullif(trim(i.name), ''), 'Товар'), i.sku, i.qty, i.unit, 0, i.image_url
  from jsonb_to_recordset(p_items) as i(product_id uuid, name text, sku text, qty numeric, unit text, image_url text);

  return json_build_object('id', v_order_id, 'order_number', v_order_number);
end;
$$ language plpgsql security invoker set search_path = public;

revoke all on function place_order(text, text, jsonb, text) from public, anon;
grant execute on function place_order(text, text, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) order_items: positive qty, and only into a fresh 'new' order
-- ---------------------------------------------------------------------------
-- NOT VALID: enforced for every new/changed row without failing on whatever
-- is already in the table.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'order_items_qty_positive') then
    alter table order_items add constraint order_items_qty_positive check (qty > 0) not valid;
  end if;
end;
$$;

drop policy if exists "customer insert own order items" on order_items;
create policy "customer insert own order items" on order_items for insert
  with check (exists (
    select 1 from orders o
    where o.id = order_items.order_id
      and o.customer_id = current_customer_id()
      and o.status = 'new'
      and o.created_at > now() - interval '10 minutes'
  ));

-- ---------------------------------------------------------------------------
-- 3) guard staff_role — same function as 0057, plus staff_role on UPDATE.
-- On INSERT it's left alone: a non-admin insert can never carry a
-- parent_customer_id (reset below), and staff_role only matters for linked
-- staff, so a self-signup picking its own position stays harmless.
-- ---------------------------------------------------------------------------
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
         or new.default_driver_id is distinct from old.default_driver_id
         or new.staff_role is distinct from old.staff_role then
        raise exception 'only an admin can change approval_status, price_tier, bank_transfer_enabled, cash_enabled, failed_login_attempts, login_locked_at, parent_customer_id, default_driver_id, or staff_role';
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
