-- Provisio — courier app support.
--
-- Two things a courier needs that 0002 didn't cover:
--   1. Read access to the customer's name/phone/address for deliveries
--      assigned to them (0002 gave couriers their own orders/order_items,
--      but nothing on `customers` at all).
--   2. Marking a delivery 'delivered' should flip the linked order to
--      'delivered' too, so the website's Orders page reflects it — but
--      couriers can't write to `orders` directly (admin-only), so this is
--      a trigger, not something the app has to orchestrate itself.
--
-- Safe to re-run: every create is guarded by a drop-if-exists first.

drop policy if exists "courier select customers on own deliveries" on customers;
create policy "courier select customers on own deliveries" on customers for select
  using (exists (
    select 1 from orders o
    join deliveries d on d.order_id = o.id
    where o.customer_id = customers.id and d.driver_id = current_driver_id()
  ));

create or replace function sync_order_status_from_delivery() returns trigger as $$
begin
  if new.status = 'delivered' and new.order_id is not null then
    update orders set status = 'delivered' where id = new.order_id and status <> 'delivered';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists deliveries_sync_order_status on deliveries;
create trigger deliveries_sync_order_status
  after update on deliveries
  for each row execute function sync_order_status_from_delivery();
