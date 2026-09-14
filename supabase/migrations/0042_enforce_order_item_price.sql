-- Provisio / Freshline — price tampering fix.
--
-- order_items.unit_price was always trusted verbatim from whatever the
-- client inserted (see the app's MBBackend.syncOrder) — nothing server-side
-- ever cross-checked it against products.price. Neither the "customer
-- insert own orders" nor "customer insert own order items" RLS policies
-- (0002_roles_auth.sql) look at price at all, only ownership/approval. A
-- modified client (or a plain REST call using a real customer's session)
-- could submit any product at any qty with unit_price set to 0 and the
-- order would go through unchanged — the courier still delivers the real
-- goods, but the computed debt/total (customer_transfer_balance,
-- customer_transfer_orders, and whatever the website shows) reflects the
-- fabricated price.
--
-- Fix: a trigger recomputes the real price server-side and overwrites
-- whatever the client sent, mirroring exactly what the app's own
-- effectivePrice() (lib/data/catalog.dart) already does — so a legitimate,
-- unmodified client sees no change at all, only a client trying to lie
-- about price does. An admin's own insert (manual order entry on the
-- website) is left untouched, same as every other guard trigger in this
-- schema.
create or replace function enforce_order_item_price() returns trigger as $$
declare
  v_price_tier price_tier;
  v_base_price numeric(10,2);
  v_base_price_external numeric(10,2);
  v_primary_unit text;
  v_unit_entry jsonb;
  v_real_price numeric(10,2);
begin
  if is_admin() then
    return new;
  end if;

  if new.product_id is null then
    raise exception 'order_items.product_id is required';
  end if;

  select p.price, p.price_external, p.unit
    into v_base_price, v_base_price_external, v_primary_unit
  from products p where p.id = new.product_id;

  if v_base_price is null then
    raise exception 'unknown product_id';
  end if;

  select c.price_tier into v_price_tier
  from orders o
  join customers c on c.id = o.customer_id
  where o.id = new.order_id;

  if new.unit is distinct from v_primary_unit then
    select up into v_unit_entry
    from products p, jsonb_array_elements(p.unit_prices) up
    where p.id = new.product_id and up->>'unit' = new.unit
    limit 1;
  end if;

  if v_unit_entry is not null then
    v_real_price := case
      when v_price_tier = 'external' and (v_unit_entry->>'price_external') is not null
        then (v_unit_entry->>'price_external')::numeric
      else (v_unit_entry->>'price')::numeric
    end;
  else
    v_real_price := case
      when v_price_tier = 'external' and v_base_price_external is not null
        then v_base_price_external
      else v_base_price
    end;
  end if;

  new.unit_price := v_real_price;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists order_items_enforce_price on order_items;
create trigger order_items_enforce_price
  before insert on order_items
  for each row execute function enforce_order_item_price();
