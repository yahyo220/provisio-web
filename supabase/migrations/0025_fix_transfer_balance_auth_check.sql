-- Provisio — fix an auth-check gap in customer_transfer_balance (0024):
-- `p_customer_id = current_customer_id()` is NULL (not false) for a caller
-- with no customers row of their own (e.g. a courier), and `if not (false
-- or NULL)` evaluates to `if NULL` -- which Postgres treats as *not*
-- entering the branch, i.e. the exception silently never fires. That let
-- any authenticated non-customer read any customer's balance by id.
-- IS NOT NULL + IS DISTINCT FROM keeps every branch a definite true/false.
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
    where o.customer_id = p_customer_id
      and o.payment_method = 'transfer'
      and o.payment = 'pending'
  ), 0);
end;
$$ language plpgsql security definer stable set search_path = public;
