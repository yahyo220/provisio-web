-- Freshline / Provisio — an order from a Telegram group nobody linked yet is
-- placed right away, without a client; an admin picks the client afterwards
-- (a button in the bot), and the order moves to that client: company number,
-- the client's prices, payment method, courier. Replaces the waiting list of
-- 0071.

drop table if exists telegram_pending;

-- The bot (and only it: the flag is set inside telegram_place_order_unlinked,
-- and a customer's own insert policy never allows a null customer) may insert
-- an order without a customer; the payment check runs once a client is chosen.
create or replace function public.enforce_order_insert_guards()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_cash_enabled boolean;
  v_bank_transfer_enabled boolean;
begin
  if is_admin() then
    return new;
  end if;
  if new.customer_id is null and current_setting('freshline.bot_unlinked_order', true) = 'on' then
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
$function$;

create or replace function telegram_place_order_unlinked(p_chat_id bigint, p_title text, p_items jsonb, p_notes text default '')
returns json as $$
declare
  v_order_id uuid;
  v_merged boolean := false;
  v_head text := 'Telegram-группа «' || coalesce(nullif(trim(p_title), ''), 'без названия') || '»: клиент ещё не выбран';
begin
  if exists (select 1 from telegram_chats where chat_id = p_chat_id) then
    raise exception 'chat_already_linked';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty_order';
  end if;

  select o.id into v_order_id
  from orders o
  where o.telegram_chat_id = p_chat_id and o.customer_id is null
    and o.status = 'new' and o.created_at > now() - interval '60 minutes'
  order by o.created_at desc
  limit 1;

  if v_order_id is not null then
    v_merged := true;
    if coalesce(trim(p_notes), '') <> '' then
      update orders set notes = notes || E'\n' || p_notes where id = v_order_id;
    end if;
  else
    perform set_config('freshline.bot_unlinked_order', 'on', true);
    insert into orders (customer_id, status, payment, payment_method, delivery_address, delivery_fee, notes, source, telegram_chat_id)
    values (null, 'new', 'pending', 'cash', '', 0, trim(both E'\n' from v_head || E'\n' || coalesce(p_notes, '')), 'telegram', p_chat_id)
    returning id into v_order_id;
    perform set_config('freshline.bot_unlinked_order', 'off', true);
  end if;

  insert into order_items (order_id, product_id, name, sku, qty, unit, unit_price, image_url)
  select v_order_id, p.id, p.name, p.sku, i.qty, i.unit, 0, p.image_url
  from jsonb_to_recordset(p_items) as i(product_id uuid, qty numeric, unit text)
  join products p on p.id = i.product_id;

  return (select json_build_object('id', o.id, 'number', o.order_number, 'merged', v_merged) from orders o where o.id = v_order_id);
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function telegram_place_order_unlinked(bigint, text, jsonb, text) from public, anon, authenticated;
grant execute on function telegram_place_order_unlinked(bigint, text, jsonb, text) to service_role;

-- Links the group and hands its client-less orders to that client.
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
