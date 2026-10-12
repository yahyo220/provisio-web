-- Freshline / Provisio — order numbers per company.
--
-- orders.order_number is one counter for the whole system, so a new client's
-- first order showed up as "№5000". Every company now counts its own orders
-- from №1: orders.company_order_number, numbered within orders.company_id
-- (the company root — linked staff such as Повар/Бармен count under their
-- company, see company_root_id, 0054). order_number stays as the internal,
-- system-wide id; everything people see switches to the company number (the
-- dashboard shows it next to the company's name, since two companies can
-- both have a №5).
--
-- Existing orders are renumbered per company in the order they were placed.

alter table orders add column if not exists company_id uuid references customers(id) on delete set null;
alter table orders add column if not exists company_order_number integer;

update orders o
set company_id = company_root_id(o.customer_id)
where o.company_id is null and o.customer_id is not null;

with numbered as (
  select id, row_number() over (partition by company_id order by created_at, order_number) as n
  from orders
  where company_id is not null
)
update orders o
set company_order_number = numbered.n
from numbered
where o.id = numbered.id and o.company_order_number is distinct from numbered.n;

create unique index if not exists orders_company_order_number_key
  on orders (company_id, company_order_number)
  where company_id is not null;

-- Every new order gets its company and that company's next number. Security
-- definer: a Повар can't see the rest of the company's orders under RLS, but
-- the counter has to. The advisory lock makes two orders placed at the same
-- moment by one company take turns instead of both reading the same max().
create or replace function assign_company_order_number() returns trigger as $$
begin
  if new.customer_id is null then
    return new;
  end if;
  new.company_id := company_root_id(new.customer_id);
  if new.company_id is null then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.company_id::text, 0));
  select coalesce(max(company_order_number), 0) + 1
    into new.company_order_number
  from orders
  where company_id = new.company_id;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists orders_assign_company_number on orders;
create trigger orders_assign_company_number
  before insert on orders
  for each row execute function assign_company_order_number();

-- place_order (0059): also hand back the company number for the app to show.
create or replace function place_order(p_payment_method text, p_address text, p_items jsonb, p_delivery_slot text default null)
returns json as $$
declare
  v_customer_id uuid := current_customer_id();
  v_order_id uuid;
  v_order_number bigint;
  v_company_number integer;
begin
  if v_customer_id is null then
    raise exception 'not_a_customer';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty_order';
  end if;

  insert into orders (customer_id, status, payment, payment_method, delivery_address, delivery_fee, notes, delivery_slot)
  values (v_customer_id, 'new', 'pending', p_payment_method, p_address, 0, '', nullif(trim(p_delivery_slot), ''))
  returning id, order_number, company_order_number into v_order_id, v_order_number, v_company_number;

  insert into order_items (order_id, product_id, name, sku, qty, unit, unit_price, image_url)
  select v_order_id, i.product_id, coalesce(nullif(trim(i.name), ''), 'Товар'), i.sku, i.qty, i.unit, 0, i.image_url
  from jsonb_to_recordset(p_items) as i(product_id uuid, name text, sku text, qty numeric, unit text, image_url text);

  return json_build_object('id', v_order_id, 'order_number', v_order_number, 'company_order_number', v_company_number);
end;
$$ language plpgsql security invoker set search_path = public;

-- Transfer history (0060): the order_number column now carries the company
-- number — that's the number the customer knows the order by.
create or replace function customer_transfer_orders(p_customer_id uuid)
returns table (
  order_id uuid,
  order_number bigint,
  amount numeric,
  payment payment_status,
  created_at timestamptz,
  paid_at timestamptz,
  order_status text,
  orderer_name text,
  orderer_role text
) as $$
begin
  if not (
    coalesce(is_admin(), false)
    or (current_customer_id() is not null and p_customer_id is not distinct from current_customer_id())
  ) then
    raise exception 'not authorized to read this history';
  end if;

  return query
    select
      o.id,
      coalesce(o.company_order_number, o.order_number)::bigint,
      order_total_with_vat(o.id),
      o.payment,
      o.created_at,
      o.paid_at,
      o.status::text,
      c.name,
      case
        when coalesce(c.staff_role, '') <> '' then c.staff_role
        when c.parent_customer_id is null then 'Руководитель'
        else ''
      end
    from orders o
    join customers c on c.id = o.customer_id
    where (
        case when coalesce(is_company_manager(p_customer_id), false)
          then company_root_id(o.customer_id) = company_root_id(p_customer_id)
          else o.customer_id = p_customer_id
        end
      )
      and o.payment_method = 'transfer'
    order by (o.payment = 'pending') desc, o.created_at desc;
end;
$$ language plpgsql security definer stable set search_path = public;

-- Review mirrored into the support chat (0046): "Отзыв за заказ №<company number>".
create or replace function order_feedback_to_support() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  n bigint;
begin
  if new.customer_id is null then
    return new;
  end if;
  begin
    select coalesce(company_order_number, order_number) into n from orders where id = new.order_id;
    insert into support_messages (customer_id, sender, message, feedback_id)
    values (
      new.customer_id,
      'customer',
      case when n is not null then 'Отзыв за заказ №' || n else 'Отзыв за заказ' end,
      new.id
    );
  exception when others then
    raise warning 'order_feedback_to_support failed: %', sqlerrm;
  end;
  return new;
end;
$$;
