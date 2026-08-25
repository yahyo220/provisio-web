-- Provisio — let deleting an order clean up its delivery too.
--
-- Since 0005 every order gets a delivery row automatically, and the
-- deliveries.order_id foreign key had no ON DELETE behavior (defaults to
-- RESTRICT) — deleting an order would always fail with a foreign key
-- violation. Order deletion (from the website's Orders page) needs this.

alter table deliveries drop constraint if exists deliveries_order_id_fkey;
alter table deliveries add constraint deliveries_order_id_fkey
  foreign key (order_id) references orders(id) on delete cascade;
