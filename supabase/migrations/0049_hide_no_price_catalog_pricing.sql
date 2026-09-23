-- Provisio / Freshline — close the last critical audit finding: products
-- pricing readable by anyone regardless of their own price_tier.
--
-- "authenticated read active products" (0002_roles_auth.sql) is a pure
-- row-level policy — it returns every column, including price/
-- price_external, to any signed-in session. The app hides prices for
-- 'no_price'-tier customers entirely client-side (catalog.dart's
-- effectivePrice()/displayPriceLabel()), so a 'no_price' customer's own
-- authenticated session could still read real prices with a direct REST
-- call, bypassing the UI. Note this was never a billing/fraud risk —
-- 0042_enforce_order_item_price.sql already recomputes the real charged
-- price server-side from `products` regardless of what the client sent —
-- purely an information-disclosure gap against the "order first, find out
-- the price later" business rule for that tier.
--
-- Fix: a security-definer RPC that nulls price/price_external (and the
-- same two keys inside each unit_prices entry) only when the calling
-- session resolves to a 'no_price' customer; anyone else (with_price,
-- external, a courier, or unresolvable) gets the row unchanged, so this
-- can only ever narrow visibility, never accidentally hide prices from
-- someone who should see them. The app's catalog_controller.dart switches
-- to calling this instead of a raw `products` select.
create or replace function list_catalog_products() returns setof products as $$
declare
  v_tier price_tier;
begin
  select c.price_tier into v_tier from customers c where c.id = current_customer_id();

  if v_tier = 'no_price' then
    return query
      -- jsonb_populate_record() (not a bare ::products cast, which Postgres
      -- doesn't support) turns the edited jsonb back into a products row;
      -- the trailing .* expands that composite into individual columns, as
      -- RETURN QUERY SELECT needs for a `setof products` function.
      select (jsonb_populate_record(null::products, (
        (to_jsonb(p) - 'price' - 'price_external' - 'unit_prices')
        || jsonb_build_object(
             'price', null,
             'price_external', null,
             'unit_prices', coalesce((
               select jsonb_agg((elem - 'price' - 'price_external') || jsonb_build_object('price', null, 'price_external', null))
               from jsonb_array_elements(p.unit_prices) elem
             ), '[]'::jsonb)
           )
      ))).*
      from products p
      where p.active = true
      order by p.updated_at desc;
  else
    return query select p.* from products p where p.active = true order by p.updated_at desc;
  end if;
end;
$$ language plpgsql security definer stable set search_path = public;

revoke all on function list_catalog_products() from public;
grant execute on function list_catalog_products() to authenticated;

-- Only one real caller of the old row-level policy existed (grepped both
-- repos): the app's own catalog fetch, now switched to the RPC above. The
-- website's admin session never used it (already on its own "admin full
-- access" policy). Safe to drop outright rather than leave the bypass live.
drop policy if exists "authenticated read active products" on products;
