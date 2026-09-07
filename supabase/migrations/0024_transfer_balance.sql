-- Provisio — "how much do I still owe via bank transfer" for the home
-- screen's weekly-due card: sum of a customer's own orders paid by
-- "Перечисление" that the admin hasn't yet marked paid. Goes back to 0 (the
-- app hides the card at 0) as soon as an admin marks those orders paid on
-- the website -- there's no separate weekly reset; "owed" just means
-- "unpaid transfer orders right now".
--
-- security definer so it can read orders/order_items regardless of the
-- caller's own RLS grants (a customer can't select() those tables
-- directly for anyone but themselves) -- which means the authorization
-- check has to happen *inside* the function instead of relying on RLS.
create or replace function customer_transfer_balance(p_customer_id uuid) returns numeric as $$
begin
  if not (is_admin() or p_customer_id = current_customer_id()) then
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

revoke all on function customer_transfer_balance(uuid) from public;
grant execute on function customer_transfer_balance(uuid) to authenticated;
