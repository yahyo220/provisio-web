-- Provisio — the app's "Перечисление" payment-methods screen needs more
-- than just the outstanding balance (customer_transfer_balance, 0024): it
-- shows each transfer order individually, unpaid ones first, each marked
-- with whether (and when) it was paid. Same security-definer + in-function
-- auth-check pattern as customer_transfer_balance, since a customer can't
-- select() orders for anyone but themselves via RLS.
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
  if not (is_admin() or p_customer_id = current_customer_id()) then
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

revoke all on function customer_transfer_orders(uuid) from public;
grant execute on function customer_transfer_orders(uuid) to authenticated;
