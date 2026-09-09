-- Provisio / Freshline — product variant grouping + per-unit pricing.
--
-- Variant grouping: an admin-curated link between products that are really
-- "the same product, different variety" (e.g. three tomato types) so the
-- app can offer them as one product with a variety picker instead of three
-- separate catalog entries to browse independently. Deliberately NOT
-- automatic — matching by name/category would sometimes group unrelated
-- products — the admin links them by hand on the website's product edit
-- page. Any two+ products sharing the same variant_group_id are siblings;
-- a product with no siblings just stays null and the app shows no picker.
alter table products add column if not exists variant_group_id uuid;
create index if not exists products_variant_group_id_idx on products (variant_group_id) where variant_group_id is not null;

-- Per-unit pricing: `price`/`price_external` stay the price for `unit`
-- (the product's primary/first unit — unchanged). `unit_prices` adds a
-- price (and optional external/wholesale price) for each of the OTHER
-- entries in `units`, so switching from "кг" to "коробка" in the app can
-- actually charge a different amount instead of silently reusing the кг
-- price. A unit missing from this array (older data, or a still-unpriced
-- new unit) falls back to the base price/price_external, same graceful
-- degradation the rest of this catalog's incremental fields already use.
alter table products add column if not exists unit_prices jsonb not null default '[]'::jsonb;
comment on column products.unit_prices is
  'Array of {unit, price, price_external} for units[1:] (units[0] uses the base price/price_external columns instead). See migration 0028.';
