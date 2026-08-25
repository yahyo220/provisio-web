-- Provisio — multiple order units per product.
--
-- `unit` stays as the single primary unit (used everywhere that already
-- expects one string: order_items.unit, receipts, the products table
-- display). `units` is the new optional list of 1-3 units the admin says
-- this product can be ordered in (e.g. кг / пучок / шт) — when it has more
-- than one entry, the shopper app shows a picker on the product page;
-- everywhere else keeps using `unit` as the default.

alter table products add column if not exists units text[];
