-- Provisio — fix the same auth-check gap in customer_transfer_orders (0037)
-- that 0025 already fixed in customer_transfer_balance: `p_customer_id =
-- current_customer_id()` is NULL (not false) for a caller with no customers
-- row of their own (e.g. a courier), and `if not (false or NULL)` evaluates
-- to `if NULL` -- which Postgres treats as *not* entering the branch, i.e.
-- the exception silently never fires. That let any authenticated non-customer
-- (in particular, any courier account) read any customer's full transfer
-- order history — order numbers, amounts, payment status, paid dates — by
-- calling this RPC with that customer's id. 0037 copied 0024's original
-- (buggy) check instead of 0025's fixed one; this applies the same fix here.
create or replace function customer_transfer_orders(p_customer_id uuid)
returns table (
  order_id uuid,
  order_number bigint,
  amount numeric,
  payment payment_status,
  created_at timestamptz,
  paid_at timestamptz
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
      o.paid_at
    from orders o
    where o.customer_id = p_customer_id
      and o.payment_method = 'transfer'
    order by (o.payment = 'pending') desc, o.created_at desc;
end;
$$ language plpgsql security definer stable set search_path = public;
