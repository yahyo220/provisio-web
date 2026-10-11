-- Freshline / Provisio — "Редактировать заказ" on the website.
--
-- The Order page used to write every keystroke in a qty/price field straight
-- to order_items, one request per change: typing "0,5" saved "0" first
-- (which 0059's qty > 0 check now refuses), a comma wasn't understood at
-- all, and a half-finished edit was already live for the customer's app and
-- invoices. The page now edits a draft and saves it here in one go — kept
-- lines get their new qty/price, lines left out are removed, new ones are
-- added — inside one transaction, so the order is never left half-edited.
--
-- p_items: [{ "id": <existing order_items.id, or null for a new line>,
--             "product_id", "name", "sku", "unit", "image_url",  (new lines)
--             "qty": > 0, "unit_price": >= 0 }]
-- Security invoker: only an admin's own RLS policies ("admin full access")
-- let these writes through; the explicit is_admin() check just gives a clear
-- error instead of a silent no-op. Admin inserts skip enforce_order_item_price
-- (0042), so the price typed on the page is the one stored.
create or replace function admin_save_order_items(p_order_id uuid, p_items jsonb) returns void as $$
begin
  if not is_admin() then
    raise exception 'only an admin can edit an order';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'an order needs at least one item — cancel the order instead';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) e
    where (e->>'unit_price') is null or (e->>'unit_price')::numeric < 0
  ) then
    raise exception 'unit_price must be zero or more';
  end if;

  delete from order_items
  where order_id = p_order_id
    and id not in (
      select (e->>'id')::uuid from jsonb_array_elements(p_items) e where e->>'id' is not null
    );

  -- qty > 0 is enforced by order_items_qty_positive (0059).
  update order_items oi
  set qty = (e->>'qty')::numeric,
      unit_price = (e->>'unit_price')::numeric
  from jsonb_array_elements(p_items) e
  where e->>'id' is not null
    and oi.id = (e->>'id')::uuid
    and oi.order_id = p_order_id;

  insert into order_items (order_id, product_id, name, sku, qty, unit, unit_price, image_url)
  select p_order_id,
         nullif(e->>'product_id', '')::uuid,
         coalesce(nullif(trim(e->>'name'), ''), 'Товар'),
         e->>'sku',
         (e->>'qty')::numeric,
         coalesce(e->>'unit', ''),
         (e->>'unit_price')::numeric,
         e->>'image_url'
  from jsonb_array_elements(p_items) e
  where e->>'id' is null;
end;
$$ language plpgsql security invoker set search_path = public;

revoke all on function admin_save_order_items(uuid, jsonb) from public, anon;
grant execute on function admin_save_order_items(uuid, jsonb) to authenticated;
