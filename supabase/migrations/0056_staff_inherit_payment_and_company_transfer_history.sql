-- Freshline / Provisio — payment is the Руководитель's business, not staff's.
--
-- 1) A linked staff member (Повар/Бармен) no longer has payment methods of
--    their own: their orders are paid the way their company's Руководитель
--    is set up (cash and/or "Перечисление"), so the cash/transfer gate on
--    order insert reads the company root's flags for them instead of their
--    own (which an admin would otherwise have to toggle per person).
-- 2) The app's "Перечисление" screen becomes company-wide for the
--    Руководитель: debt and order list cover every order paid by transfer
--    by anyone in the company, each with who placed it (name + position).
--
-- company_root_id / is_company_manager are re-declared here (identical to
-- 0054) so this file doesn't depend on that one having run first.

create or replace function company_root_id(p_customer_id uuid) returns uuid as $$
  select coalesce(parent_customer_id, id) from customers where id = p_customer_id;
$$ language sql security definer stable set search_path = public;

create or replace function is_company_manager(p_customer_id uuid) returns boolean as $$
  select parent_customer_id is null or staff_role = 'Руководитель'
  from customers where id = p_customer_id;
$$ language sql security definer stable set search_path = public;

-- Whose cash/bank-transfer flags apply to this customer: their company
-- root's when they're plain linked staff, their own otherwise.
create or replace function payment_owner_id(p_customer_id uuid) returns uuid as $$
  select case
    when parent_customer_id is not null and coalesce(staff_role, '') <> 'Руководитель' then parent_customer_id
    else id
  end
  from customers where id = p_customer_id;
$$ language sql security definer stable set search_path = public;

-- ---------------------------------------------------------------------------
-- order insert guard (0048) — same as before except which row's flags it reads
-- ---------------------------------------------------------------------------
create or replace function enforce_order_insert_guards() returns trigger as $$
declare
  v_cash_enabled boolean;
  v_bank_transfer_enabled boolean;
begin
  if is_admin() then
    return new;
  end if;

  new.status := 'new';
  new.payment := 'pending';
  new.paid_at := null;
  new.delivery_fee := 0;

  select cash_enabled, bank_transfer_enabled into v_cash_enabled, v_bank_transfer_enabled
  from customers where id = payment_owner_id(new.customer_id);

  if new.payment_method = 'cash' then
    if not coalesce(v_cash_enabled, false) then
      raise exception 'cash payment is not enabled for this customer';
    end if;
  elsif new.payment_method = 'transfer' then
    if not coalesce(v_bank_transfer_enabled, false) then
      raise exception 'bank transfer is not enabled for this customer';
    end if;
  else
    raise exception 'invalid payment_method: %', new.payment_method;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- What the app should treat as "my" payment access (cash / transfer, granted
-- or requested): the caller's own for a Руководитель or solo customer, the
-- company root's for linked staff.
create or replace function my_payment_access() returns json as $$
  select json_build_object(
    'cash_enabled', c.cash_enabled,
    'cash_requested', c.cash_requested,
    'bank_transfer_enabled', c.bank_transfer_enabled,
    'bank_transfer_requested', c.bank_transfer_requested
  )
  from customers c
  where c.id = payment_owner_id(current_customer_id());
$$ language sql security definer stable set search_path = public;

revoke all on function my_payment_access() from public, anon;
grant execute on function my_payment_access() to authenticated;

-- ---------------------------------------------------------------------------
-- company-wide transfer debt (replaces 0045's version): for a Руководитель
-- it covers every company member's unpaid, non-cancelled transfer orders;
-- for anyone else, only their own, exactly as before.
-- ---------------------------------------------------------------------------
create or replace function customer_transfer_balance(p_customer_id uuid) returns numeric as $$
begin
  if not (
    coalesce(is_admin(), false)
    or (current_customer_id() is not null and p_customer_id is not distinct from current_customer_id())
  ) then
    raise exception 'not authorized to read this balance';
  end if;

  return coalesce((
    select sum(oi.qty * oi.unit_price)
    from orders o
    join order_items oi on oi.order_id = o.id
    where (
        case when coalesce(is_company_manager(p_customer_id), false)
          then company_root_id(o.customer_id) = company_root_id(p_customer_id)
          else o.customer_id = p_customer_id
        end
      )
      and o.payment_method = 'transfer'
      and o.payment = 'pending'
      and o.status <> 'cancelled'
  ), 0);
end;
$$ language plpgsql security definer stable set search_path = public;

-- ---------------------------------------------------------------------------
-- company-wide transfer order list: same auth check as 0040, but a
-- Руководитель gets the whole company's orders, each with who placed it and
-- that person's position (root accounts without a position read as
-- "Руководитель"), plus the order status so the app can leave cancelled
-- orders out of any debt it sums up itself.
-- ---------------------------------------------------------------------------
drop function if exists customer_transfer_orders(uuid);
create function customer_transfer_orders(p_customer_id uuid)
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
      o.order_number,
      coalesce((select sum(oi.qty * oi.unit_price) from order_items oi where oi.order_id = o.id), 0),
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

revoke all on function customer_transfer_orders(uuid) from public, anon;
grant execute on function customer_transfer_orders(uuid) to authenticated;
