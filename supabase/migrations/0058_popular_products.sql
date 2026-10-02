-- Freshline / Provisio — "Популярные товары" on the app's home screen are now
-- the products that showed up in the most orders recently, instead of just
-- the 6 most recently edited ones. Cancelled orders don't count; only active
-- products qualify. Security definer because a customer can't read other
-- customers' orders themselves; it hands back product ids only, in ranked
-- order — no counts, no customers. The app fills any remaining slots with
-- its usual catalog order when fewer than p_limit products have orders.
create or replace function popular_product_ids(p_limit int default 6) returns setof uuid as $$
  select oi.product_id
  from order_items oi
  join orders o on o.id = oi.order_id
  join products p on p.id = oi.product_id
  where oi.product_id is not null
    and p.active = true
    and o.status <> 'cancelled'
    and o.created_at > now() - interval '90 days'
  group by oi.product_id
  order by count(distinct o.id) desc, max(o.created_at) desc
  limit greatest(p_limit, 0);
$$ language sql security definer stable set search_path = public;

revoke all on function popular_product_ids(int) from public, anon;
grant execute on function popular_product_ids(int) to authenticated;
