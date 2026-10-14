-- Freshline / Provisio — a Telegram follow-up only joins an order of the
-- client the group is linked to *now*. After /link moved a group to another
-- client, the next list was still added to the previous client's open order.

create or replace function telegram_place_order(p_chat_id bigint, p_items jsonb, p_notes text default '')
returns json as $$
declare
  v_customer_id uuid;
  v_cash boolean;
  v_transfer boolean;
  v_order_id uuid;
  v_merged boolean := false;
  v_address text;
begin
  select customer_id into v_customer_id from telegram_chats where chat_id = p_chat_id;
  if v_customer_id is null then
    raise exception 'chat_not_linked';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty_order';
  end if;

  select o.id into v_order_id
  from orders o
  where o.telegram_chat_id = p_chat_id and o.customer_id = v_customer_id
    and o.status = 'new' and o.created_at > now() - interval '60 minutes'
  order by o.created_at desc
  limit 1;

  if v_order_id is not null then
    v_merged := true;
    if coalesce(trim(p_notes), '') <> '' then
      update orders set notes = trim(both E'\n' from coalesce(notes, '') || E'\n' || p_notes) where id = v_order_id;
    end if;
  else
    -- Same rule as enforce_order_insert_guards: the company owner's settings.
    select c.cash_enabled, c.bank_transfer_enabled into v_cash, v_transfer
    from customers c where c.id = payment_owner_id(v_customer_id);
    select nullif(trim(location), '—') into v_address from customers where id = v_customer_id;

    insert into orders (customer_id, status, payment, payment_method, delivery_address, delivery_fee, notes, source, telegram_chat_id)
    values (
      v_customer_id, 'new', 'pending',
      case when coalesce(v_transfer, false) then 'transfer' else 'cash' end,
      coalesce(v_address, ''), 0, coalesce(p_notes, ''), 'telegram', p_chat_id
    )
    returning id into v_order_id;
  end if;

  -- unit_price is set by enforce_order_item_price (0042).
  insert into order_items (order_id, product_id, name, sku, qty, unit, unit_price, image_url)
  select v_order_id, p.id, p.name, p.sku, i.qty, i.unit, 0, p.image_url
  from jsonb_to_recordset(p_items) as i(product_id uuid, qty numeric, unit text)
  join products p on p.id = i.product_id;

  return (
    select json_build_object('id', o.id, 'number', coalesce(o.company_order_number, o.order_number), 'merged', v_merged)
    from orders o where o.id = v_order_id
  );
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function telegram_place_order(bigint, jsonb, text) from public, anon, authenticated;
grant execute on function telegram_place_order(bigint, jsonb, text) to service_role;
