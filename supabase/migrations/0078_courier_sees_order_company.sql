-- Freshline / Provisio — a courier sees the company of each order on their
-- deliveries, not only the person who placed it, so the courier app can show
-- "Mado №3 · Повар Алишер" when a staff member ordered for their company.

create or replace function public.courier_can_see_customer(target_customer_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1 from orders o
    join deliveries d on d.order_id = o.id
    where (o.customer_id = target_customer_id or o.company_id = target_customer_id)
      and d.driver_id = current_driver_id()
  );
$function$;
