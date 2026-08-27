-- Provisio — fix "infinite recursion detected in policy for relation
-- orders" (Postgres error 42P17), which broke every new order placed from
-- the app since migration 0004.
--
-- The cycle: placing an order runs orders' INSERT check, which reads
-- `customers` (to confirm approval_status='approved') — but customers' own
-- SELECT policy from 0004 ("courier select customers on own deliveries")
-- reads `orders` again to figure out if a courier can see that customer.
-- orders -> customers -> orders is exactly the loop Postgres refuses to
-- evaluate.
--
-- Fix: move that policy's logic into a security-definer function. Definer
-- functions here are owned by the postgres/superuser role (however this
-- migration gets run), which bypasses RLS entirely when the function reads
-- orders/deliveries internally — so evaluating the customers policy no
-- longer re-triggers orders' RLS at all, breaking the cycle.

create or replace function courier_can_see_customer(target_customer_id uuid) returns boolean as $$
  select exists (
    select 1 from orders o
    join deliveries d on d.order_id = o.id
    where o.customer_id = target_customer_id and d.driver_id = current_driver_id()
  );
$$ language sql security definer stable set search_path = public;

drop policy if exists "courier select customers on own deliveries" on customers;
create policy "courier select customers on own deliveries" on customers for select
  using (courier_can_see_customer(customers.id));
