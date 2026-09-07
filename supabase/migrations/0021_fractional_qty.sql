-- Provisio — allow fractional quantities on order lines (e.g. 1.5 кг of a
-- weight-sold product). order_items.qty was `integer`; a checkout with a
-- fractional amount would otherwise fail the insert outright.

alter table order_items alter column qty type numeric(10, 3);
alter table order_items alter column qty set default 1;
