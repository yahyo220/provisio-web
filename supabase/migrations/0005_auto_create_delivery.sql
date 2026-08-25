-- Provisio — auto-create a delivery row for every order.
--
-- Orders and deliveries were separate tables with nothing linking them at
-- creation time — an order placed from the app (or added by hand on the
-- website) never got a `deliveries` row, so there was nothing to assign a
-- courier to on the Deliveries page. This adds a trigger so every new order
-- gets one automatically, and backfills existing orders that don't have one.

create or replace function create_delivery_for_order() returns trigger as $$
begin
  insert into deliveries (order_id, address, status)
  values (new.id, new.delivery_address, 'scheduled');
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger orders_create_delivery
  after insert on orders
  for each row execute function create_delivery_for_order();

-- Backfill: give every existing order without one a delivery row too.
insert into deliveries (order_id, address, status)
select o.id, o.delivery_address, 'scheduled'
from orders o
where not exists (select 1 from deliveries d where d.order_id = o.id);
