-- Freshline — the warehouse (Склад) in the database, replacing the page's
-- in-memory demo state (src/lib/warehouse.ts keeps the same shapes).
--
-- Model (agreed with the business, see the warehouse plan):
-- - stock is kept in each product's own unit (products.unit — kg, piece…);
--   other sales units (box…) can carry a size in base units (unit_size);
-- - every receipt line is a batch with a purchase price and an expiry date;
--   stock leaves the oldest-expiring batch first;
-- - the movement journal is the source of truth for stock (sum of delta), so
--   stock may go negative when an order leaves with nothing on the shelf;
-- - an order leaves the warehouse when its delivery goes 'in-transit' (the
--   courier took it) or straight to 'delivered' — once per order.
--
-- Pricing: posting a receipt sets each product's sale price from the
-- purchase price + margin (pricing_settings), rounded UP to a round number,
-- and only ever RAISES it — lowering is the admin's call (the site suggests
-- it). The external price follows its own percent once that is set.
--
-- Everything here is admin-only: customers and couriers never read purchase
-- prices or stock. The order trigger writes through a security definer
-- function, so a courier's status change still takes stock off.

create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);
insert into public.warehouses (name)
select 'Основной склад' where not exists (select 1 from public.warehouses);

create table if not exists public.warehouse_settings (
  product_id uuid primary key references public.products(id) on delete cascade,
  min_stock numeric not null default 0 check (min_stock >= 0),
  tracks_expiry boolean not null default true,
  shelf_life_days int check (shelf_life_days > 0),
  -- Base units per other sales unit, keyed by products.units value: {"box": 10}.
  unit_size jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create sequence if not exists public.warehouse_receipt_number_seq;

create table if not exists public.warehouse_receipts (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  warehouse_id uuid references public.warehouses(id),
  received_at timestamptz not null,
  supplier text not null default '',
  comment text not null default '',
  posted_by text not null default 'Админ',
  created_at timestamptz not null default now()
);

create table if not exists public.warehouse_batches (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.warehouse_receipts(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  line_no int not null,
  received_at timestamptz not null,
  qty_received numeric not null check (qty_received > 0),
  qty_left numeric not null check (qty_left >= 0),
  -- Per base unit (products.unit), before VAT.
  purchase_price numeric not null check (purchase_price >= 0),
  expires_at date,
  -- What was typed when it wasn't the base unit ("3 коробки").
  entered_qty numeric,
  entered_unit text
);
create index if not exists warehouse_batches_product on public.warehouse_batches (product_id, received_at desc);

create table if not exists public.warehouse_write_offs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  product_id uuid not null references public.products(id) on delete cascade,
  batch_id uuid references public.warehouse_batches(id) on delete set null,
  qty numeric not null check (qty > 0),
  reason text not null check (reason in ('spoiled', 'damaged', 'expired', 'other')),
  comment text not null default '',
  -- Purchase value of what was written off.
  loss numeric not null default 0
);

create table if not exists public.warehouse_movements (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  product_id uuid not null references public.products(id) on delete cascade,
  type text not null check (type in ('receipt', 'order', 'writeoff', 'adjustment')),
  delta numeric not null,
  balance_after numeric not null,
  ref text not null default '',
  -- Set for type 'order'. No foreign key on purpose (see the orders/customers
  -- embed lesson, 0077); an order's stock leaves once (index below).
  order_id uuid
);
create index if not exists warehouse_movements_product on public.warehouse_movements (product_id, at desc);
create unique index if not exists warehouse_movements_order_once
  on public.warehouse_movements (order_id, product_id) where type = 'order';

create table if not exists public.pricing_settings (
  key text primary key,
  value numeric,
  updated_at timestamptz not null default now()
);
insert into public.pricing_settings (key, value) values
  ('margin_percent', 12),
  -- Null until the business picks it: the external price stays manual till then.
  ('external_margin_percent', null)
on conflict (key) do nothing;

-- Admin-only, every table.
do $$
declare t text;
begin
  foreach t in array array['warehouses', 'warehouse_settings', 'warehouse_receipts', 'warehouse_batches',
                           'warehouse_write_offs', 'warehouse_movements', 'pricing_settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "admin manages %1$s" on public.%1$I', t);
    execute format('create policy "admin manages %1$s" on public.%1$I for all using (is_admin()) with check (is_admin())', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
grant usage on sequence public.warehouse_receipt_number_seq to authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

/* Sale price rounded UP to a round number, so the margin never ends below the
 * set percent: under 10 000 to 100, up to 100 000 to 500, above that to 1 000. */
create or replace function public.round_sale_price(p numeric) returns numeric
language sql immutable as $$
  select case
    when p is null then null
    when p < 10000 then ceil(p / 100) * 100
    when p <= 100000 then ceil(p / 500) * 500
    else ceil(p / 1000) * 1000
  end
$$;

/* The Russian label order_items carry for a products.unit value. */
create or replace function public.unit_label_ru(u text) returns text
language sql immutable as $$
  select case lower(u)
    when 'kg' then 'кг' when 'piece' then 'шт.' when 'bunch' then 'пучок' when 'box' then 'коробка'
    when 'bottle' then 'бутылка' when 'package' then 'упаковка' when 'bag' then 'мешок'
    when 'pack' then 'уп.' when 'gram' then 'грамм' else lower(u)
  end
$$;

/* [p_qty] of [p_unit] (English key or Russian label) in the product's base
 * unit; null when it can't be converted (a unit without a size). */
create or replace function public.warehouse_base_qty(p_product uuid, p_unit text, p_qty numeric) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare
  base text;
  u text := lower(trim(coalesce(p_unit, '')));
  sizes jsonb;
  k text;
begin
  select unit into base from products where id = p_product;
  if base is null then return null; end if;
  if u = '' or u = lower(base) or u = unit_label_ru(base) then return p_qty; end if;
  if lower(base) = 'kg' and u in ('gram', 'грамм', 'г', 'гр') then return p_qty / 1000; end if;
  select unit_size into sizes from warehouse_settings where product_id = p_product;
  if sizes is not null then
    for k in select jsonb_object_keys(sizes) loop
      if u = lower(k) or u = unit_label_ru(k) then
        return p_qty * (sizes ->> k)::numeric;
      end if;
    end loop;
  end if;
  return null;
end $$;

create or replace function public.warehouse_stock(p_product uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(delta), 0) from warehouse_movements where product_id = p_product
$$;

/* Takes [p_qty] off the product's batches, oldest-expiring first. Whatever
 * the batches can't cover just leaves stock negative (the journal records it). */
create or replace function public.warehouse_take_fifo(p_product uuid, p_qty numeric) returns void
language plpgsql security definer set search_path = public as $$
declare
  left_qty numeric := p_qty;
  b record;
  take numeric;
begin
  for b in
    select id, qty_left from warehouse_batches
    where product_id = p_product and qty_left > 0
    order by expires_at nulls last, received_at
    for update
  loop
    exit when left_qty <= 0;
    take := least(b.qty_left, left_qty);
    update warehouse_batches set qty_left = qty_left - take where id = b.id;
    left_qty := left_qty - take;
  end loop;
end $$;

/* Raises the product's sale prices from a purchase price (per base unit):
 * main price, other units with a known size, and the external price once its
 * percent is set. Never lowers anything. Returns {old, new} when it changed. */
create or replace function public.warehouse_apply_price(p_product uuid, p_cost numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m numeric := coalesce((select value from pricing_settings where key = 'margin_percent'), 12);
  ext numeric := (select value from pricing_settings where key = 'external_margin_percent');
  p record;
  sizes jsonb;
  new_price numeric;
  new_ext numeric;
  new_units jsonb := '[]'::jsonb;
  e jsonb;
  size numeric;
  up numeric;
  up_ext numeric;
begin
  if p_cost is null or p_cost <= 0 then return null; end if;
  select id, name, price, price_external, unit_prices into p from products where id = p_product for update;
  if not found then return null; end if;
  sizes := coalesce((select unit_size from warehouse_settings where product_id = p_product), '{}'::jsonb);

  new_price := greatest(coalesce(p.price, 0), round_sale_price(p_cost * (1 + m / 100)));
  new_ext := case when ext is null then p.price_external
                  else greatest(coalesce(p.price_external, 0), round_sale_price(p_cost * (1 + ext / 100))) end;

  for e in select * from jsonb_array_elements(coalesce(p.unit_prices, '[]'::jsonb)) loop
    size := nullif(sizes ->> (e ->> 'unit'), '')::numeric;
    if size is not null and size > 0 then
      up := greatest(coalesce((e ->> 'price')::numeric, 0), round_sale_price(p_cost * size * (1 + m / 100)));
      e := jsonb_set(e, '{price}', to_jsonb(up));
      if ext is not null then
        up_ext := greatest(coalesce((e ->> 'price_external')::numeric, 0), round_sale_price(p_cost * size * (1 + ext / 100)));
        e := jsonb_set(e, '{price_external}', to_jsonb(up_ext));
      end if;
    end if;
    new_units := new_units || jsonb_build_array(e);
  end loop;

  if new_price is distinct from p.price or new_ext is distinct from p.price_external
     or new_units is distinct from coalesce(p.unit_prices, '[]'::jsonb) then
    update products
      set price = new_price,
          price_external = new_ext,
          unit_prices = case when p.unit_prices is null then null else new_units end,
          updated_at = now()
      where id = p_product;
  end if;
  if new_price is distinct from p.price then
    return jsonb_build_object('product_id', p.id, 'name', p.name, 'old', p.price, 'new', new_price);
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- Posting (called from the Склад page)
-- ---------------------------------------------------------------------------

/* One receipt: a batch and a journal row per line, then the sale prices.
 * p_lines: [{product_id, qty, purchase_price, expires_at, entered_qty, entered_unit}]. */
create or replace function public.warehouse_post_receipt(
  p_received_at timestamptz, p_supplier text, p_comment text, p_lines jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  rid uuid;
  num text;
  l jsonb;
  i int := 0;
  pid uuid;
  qty numeric;
  balance numeric;
  last_cost jsonb := '{}'::jsonb;
  k text;
  change jsonb;
  changes jsonb := '[]'::jsonb;
begin
  if not is_admin() then raise exception 'only an admin can post a receipt'; end if;
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then raise exception 'empty receipt'; end if;

  num := 'ПР-' || lpad(nextval('warehouse_receipt_number_seq')::text, 4, '0');
  insert into warehouse_receipts (number, warehouse_id, received_at, supplier, comment)
    values (num, (select id from warehouses order by created_at limit 1), p_received_at, coalesce(p_supplier, ''), coalesce(p_comment, ''))
    returning id into rid;

  for l in select * from jsonb_array_elements(p_lines) loop
    i := i + 1;
    pid := (l ->> 'product_id')::uuid;
    qty := (l ->> 'qty')::numeric;
    insert into warehouse_batches (receipt_id, product_id, line_no, received_at, qty_received, qty_left, purchase_price, expires_at, entered_qty, entered_unit)
      values (rid, pid, i, p_received_at, qty, qty, (l ->> 'purchase_price')::numeric,
              nullif(l ->> 'expires_at', '')::date, nullif(l ->> 'entered_qty', '')::numeric, nullif(l ->> 'entered_unit', ''));
    balance := warehouse_stock(pid) + qty;
    insert into warehouse_movements (at, product_id, type, delta, balance_after, ref)
      values (p_received_at, pid, 'receipt', qty, balance, num);
    -- The last line of a product sets its price (a receipt can list it twice).
    last_cost := last_cost || jsonb_build_object(pid::text, (l ->> 'purchase_price')::numeric);
  end loop;

  for k in select jsonb_object_keys(last_cost) loop
    change := warehouse_apply_price(k::uuid, (last_cost ->> k)::numeric);
    if change is not null then changes := changes || jsonb_build_array(change); end if;
  end loop;

  return jsonb_build_object('id', rid, 'number', num, 'lines', i, 'price_changes', changes);
end $$;

/* Manual write-offs. p_items: [{product_id, batch_id|null, qty, reason, comment}].
 * Without a batch the quantity leaves the oldest-expiring batches first. */
create or replace function public.warehouse_post_write_offs(p_items jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  it jsonb;
  pid uuid;
  bid uuid;
  qty numeric;
  price numeric;
  n int := 0;
  label text;
begin
  if not is_admin() then raise exception 'only an admin can write stock off'; end if;
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    pid := (it ->> 'product_id')::uuid;
    bid := nullif(it ->> 'batch_id', '')::uuid;
    qty := (it ->> 'qty')::numeric;
    price := null;
    if bid is not null then
      select purchase_price into price from warehouse_batches where id = bid;
      update warehouse_batches set qty_left = greatest(0, qty_left - qty) where id = bid;
    else
      select purchase_price into price from warehouse_batches
        where product_id = pid and qty_left > 0 order by expires_at nulls last, received_at limit 1;
      if price is null then
        select purchase_price into price from warehouse_batches where product_id = pid order by received_at desc limit 1;
      end if;
      perform warehouse_take_fifo(pid, qty);
    end if;
    insert into warehouse_write_offs (product_id, batch_id, qty, reason, comment, loss)
      values (pid, bid, qty, it ->> 'reason', coalesce(it ->> 'comment', ''), qty * coalesce(price, 0));
    label := case it ->> 'reason' when 'spoiled' then 'Порча' when 'damaged' then 'Брак'
                                  when 'expired' then 'Просрочка' else 'Другое' end;
    insert into warehouse_movements (product_id, type, delta, balance_after, ref)
      values (pid, 'writeoff', -qty, warehouse_stock(pid) - qty, label);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- Orders leave the warehouse
-- ---------------------------------------------------------------------------

/* Takes an order's goods off stock, once. Lines whose unit can't be turned
 * into the base unit (a box without a size) are skipped. */
create or replace function public.warehouse_deduct_order(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  o record;
  r record;
  ref text;
begin
  if exists (select 1 from warehouse_movements where order_id = p_order and type = 'order') then return; end if;
  select ord.id, coalesce(ord.company_order_number, ord.order_number) as num,
         coalesce(nullif(trim(c.company_name), ''), c.name, '') as company
    into o
    from orders ord left join customers c on c.id = coalesce(ord.company_id, ord.customer_id)
    where ord.id = p_order;
  if not found then return; end if;
  ref := trim('Заказ ' || o.company || ' №' || coalesce(o.num::text, ''));
  for r in
    select oi.product_id, sum(warehouse_base_qty(oi.product_id, oi.unit, oi.qty)) as qty
    from order_items oi
    where oi.order_id = p_order and oi.product_id is not null and oi.qty > 0
    group by oi.product_id
  loop
    continue when r.qty is null or r.qty <= 0;
    perform warehouse_take_fifo(r.product_id, r.qty);
    insert into warehouse_movements (product_id, type, delta, balance_after, ref, order_id)
      values (r.product_id, 'order', -r.qty, warehouse_stock(r.product_id) - r.qty, ref, p_order);
  end loop;
end $$;

create or replace function public.deliveries_take_stock() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.order_id is not null and new.status in ('in-transit', 'delivered')
     and new.status is distinct from old.status then
    begin
      perform warehouse_deduct_order(new.order_id);
    exception when others then
      -- Never let the warehouse stop a courier's status change.
      raise warning 'warehouse_deduct_order(%) failed: %', new.order_id, sqlerrm;
    end;
  end if;
  return new;
end $$;

drop trigger if exists deliveries_take_stock on public.deliveries;
create trigger deliveries_take_stock after update of status on public.deliveries
  for each row execute function public.deliveries_take_stock();

-- Only the posting functions are callable from the site; the internals are not.
revoke execute on function public.warehouse_base_qty(uuid, text, numeric) from public, anon, authenticated;
revoke execute on function public.warehouse_take_fifo(uuid, numeric) from public, anon, authenticated;
revoke execute on function public.warehouse_apply_price(uuid, numeric) from public, anon, authenticated;
revoke execute on function public.warehouse_deduct_order(uuid) from public, anon, authenticated;
revoke execute on function public.deliveries_take_stock() from public, anon, authenticated;
revoke execute on function public.warehouse_stock(uuid) from public, anon;
revoke execute on function public.warehouse_post_receipt(timestamptz, text, text, jsonb) from public, anon;
revoke execute on function public.warehouse_post_write_offs(jsonb) from public, anon;
grant execute on function public.warehouse_post_receipt(timestamptz, text, text, jsonb) to authenticated;
grant execute on function public.warehouse_post_write_offs(jsonb) to authenticated;
grant execute on function public.warehouse_stock(uuid) to authenticated;

notify pgrst, 'reload schema';
