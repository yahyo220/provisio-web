-- Freshline / Provisio — linking a Telegram chat to a client sets the
-- client's courier on the chat's orders, but guard_delivery_privileged_fields
-- only let an admin change deliveries.driver_id, so telegram_assign_chat
-- failed. Trust the service role (the bot) like guard_driver_privileged_fields
-- does (0060), and telegram_assign_chat itself through a transaction-local
-- flag that only it sets.

create or replace function public.guard_delivery_privileged_fields()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not (is_admin() or auth.role() = 'service_role' or current_setting('freshline.bot_assign', true) = 'on') then
    if new.order_id is distinct from old.order_id then
      raise exception 'only an admin can reassign a delivery to a different order';
    end if;
    if new.driver_id is distinct from old.driver_id then
      raise exception 'only an admin can reassign a delivery to a different courier';
    end if;
  end if;
  return new;
end;
$function$;

create or replace function telegram_assign_chat(p_chat_id bigint, p_customer_id uuid, p_title text default null)
returns integer as $$
declare
  v_order record;
  v_company uuid := company_root_id(p_customer_id);
  v_cash boolean;
  v_transfer boolean;
  v_driver uuid;
  v_address text;
  v_count integer := 0;
begin
  if v_company is null then
    raise exception 'unknown_customer';
  end if;
  -- Lets guard_delivery_privileged_fields accept the client's courier below.
  perform set_config('freshline.bot_assign', 'on', true);
  insert into telegram_chats (chat_id, customer_id, title, linked_at)
  values (p_chat_id, p_customer_id, p_title, now())
  on conflict (chat_id) do update set customer_id = excluded.customer_id, title = coalesce(excluded.title, telegram_chats.title), linked_at = now();

  select cash_enabled, bank_transfer_enabled into v_cash, v_transfer from customers where id = payment_owner_id(p_customer_id);
  select default_driver_id into v_driver from customers where id = v_company;
  select nullif(trim(location), '—') into v_address from customers where id = p_customer_id;

  for v_order in select id from orders where telegram_chat_id = p_chat_id and customer_id is null order by created_at loop
    perform pg_advisory_xact_lock(hashtextextended(v_company::text, 0));
    update orders set
      customer_id = p_customer_id,
      company_id = v_company,
      company_order_number = (select coalesce(max(company_order_number), 0) + 1 from orders where company_id = v_company),
      payment_method = case when coalesce(v_transfer, false) then 'transfer' else 'cash' end,
      delivery_address = coalesce(nullif(delivery_address, ''), v_address, ''),
      notes = trim(both E'\n' from regexp_replace(notes, '^Telegram-группа «[^»]*»: клиент ещё не выбран\n?', ''))
    where id = v_order.id;

    -- Re-insert the lines so enforce_order_item_price sets this client's prices.
    create temp table if not exists _tg_lines (product_id uuid, name text, sku text, qty numeric, unit text, image_url text) on commit drop;
    delete from _tg_lines;
    insert into _tg_lines select product_id, name, sku, qty, unit, image_url from order_items where order_id = v_order.id;
    delete from order_items where order_id = v_order.id;
    insert into order_items (order_id, product_id, name, sku, qty, unit, unit_price, image_url)
    select v_order.id, product_id, name, sku, qty, unit, 0, image_url from _tg_lines;

    update deliveries set driver_id = coalesce(driver_id, v_driver), address = coalesce(nullif(address, ''), v_address, '') where order_id = v_order.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function telegram_assign_chat(bigint, uuid, text) from public, anon, authenticated;
grant execute on function telegram_assign_chat(bigint, uuid, text) to service_role;
