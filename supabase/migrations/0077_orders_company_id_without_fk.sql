-- Freshline / Provisio — fix for 0062. orders.company_id was a second foreign
-- key from orders to customers, which made every PostgREST embed
-- "orders(... customers(...))" ambiguous (PGRST201): the courier's delivery
-- list and the app's order history came back as errors, i.e. empty, in every
-- installed app version. Keep the column, drop the constraint, and keep its
-- "on delete set null" behaviour with a trigger.

alter table orders drop constraint if exists orders_company_id_fkey;

create or replace function public.clear_orders_company_on_customer_delete() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update orders set company_id = null where company_id = old.id;
  return old;
end;
$$;

drop trigger if exists customers_clear_orders_company on customers;
create trigger customers_clear_orders_company before delete on customers
  for each row execute function public.clear_orders_company_on_customer_delete();

-- Make PostgREST forget the old relationship right away.
notify pgrst, 'reload schema';
