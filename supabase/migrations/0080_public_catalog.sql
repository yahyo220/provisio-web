-- Freshline — public catalog for the marketing website (freshline landing).
--
-- The landing page is open to anyone (no login), but `products` has no
-- anon-readable policy since 0002, and list_catalog_products() (0049) is
-- authenticated-only. Rather than open the table itself to anon (which would
-- expose price/price_external/unit_prices and every other column), this
-- security-definer RPC returns ONLY the presentational columns of active
-- products: names (+ 0026 translations), category, unit and photo.
-- No prices, stock, SKU or internal fields ever leave through here.
--
-- Category photos for the tiles come from public.category_photos, already
-- anon-readable since 0079.
create or replace function public_catalog()
returns table (
  name text,
  name_uz_latn text,
  name_uz_cyrl text,
  name_en text,
  category text,
  unit text,
  image_url text
) as $$
  select
    p.name::text,
    p.name_uz_latn::text,
    p.name_uz_cyrl::text,
    p.name_en::text,
    p.category::text,
    p.unit::text,
    p.image_url::text
  from products p
  where p.active = true
  order by p.category, p.name;
$$ language sql security definer stable set search_path = public;

-- Name anon explicitly as well as public: 0053 found anon can hold grants
-- that don't come from PUBLIC.
revoke all on function public_catalog() from public, anon, authenticated;
grant execute on function public_catalog() to anon, authenticated;
