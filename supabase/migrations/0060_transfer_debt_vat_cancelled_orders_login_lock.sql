-- Freshline / Provisio — more fixes from the 2026-10-11 review.
--
-- 1) Transfer debt now includes VAT. Checkout, the app's order history
--    (MBOrder.fromServerRow) and every накладная add 12% VAT on top of the
--    line sum, but customer_transfer_balance/customer_transfer_orders summed
--    the bare lines — so "Перечисление" showed a debt 12% below what the
--    invoice asks for. Both now return the same per-order total the app
--    shows: each line rounded like OrderLine.lineTotal, then
--    total = sum + round(sum * 0.12). Keep 0.12 in sync with the app's
--    CartController.kVatRate and the website's VAT_RATE (exportInvoices.ts).
--
-- 2) A courier marking a delivery "delivered" used to flip its order to
--    'delivered' even when an admin had already cancelled that order —
--    bringing it back into debt and stats. Cancelled orders stay cancelled.
--
-- 3) Login lockout (0044) locked an account for good after 3 wrong
--    passwords until an admin stepped in — anyone who knew a login (they're
--    short and guessable) could lock any customer or courier out, including
--    the shared App Review account. Now: 5 wrong passwords lock the login
--    for 15 minutes, after which it unlocks by itself; the website's
--    "Разблокировать" still clears it early. Keep 15 minutes in sync with
--    LOGIN_LOCK_MINUTES on the website (src/lib/loginLock.ts) and the
--    message in supabase/functions/login.
--
-- 4) Courier rows could not be changed by the edge functions at all, which
--    broke a courier deleting their own account (see section 4 below).

-- ---------------------------------------------------------------------------
-- 1) transfer debt with VAT
-- ---------------------------------------------------------------------------
-- What the app shows as an order's total: lines rounded to whole sums, plus
-- 12% VAT rounded once per order.
create or replace function order_total_with_vat(p_order_id uuid) returns numeric as $$
  select s + round(s * 0.12)
  from (
    select coalesce(sum(round(round(oi.unit_price) * oi.qty)), 0) as s
    from order_items oi
    where oi.order_id = p_order_id
  ) t;
$$ language sql stable set search_path = public;

revoke all on function order_total_with_vat(uuid) from public, anon;
grant execute on function order_total_with_vat(uuid) to authenticated;

-- Same auth check and company scope as 0056 — only the amount changed.
create or replace function customer_transfer_balance(p_customer_id uuid) returns numeric as $$
begin
  if not (
    coalesce(is_admin(), false)
    or (current_customer_id() is not null and p_customer_id is not distinct from current_customer_id())
  ) then
    raise exception 'not authorized to read this balance';
  end if;

  return coalesce((
    select sum(order_total_with_vat(o.id))
    from orders o
    where (
        case when coalesce(is_company_manager(p_customer_id), false)
          then company_root_id(o.customer_id) = company_root_id(p_customer_id)
          else o.customer_id = p_customer_id
        end
      )
      and o.payment_method = 'transfer'
      and o.payment = 'pending'
      and o.status <> 'cancelled'
  ), 0);
end;
$$ language plpgsql security definer stable set search_path = public;

create or replace function customer_transfer_orders(p_customer_id uuid)
returns table (
  order_id uuid,
  order_number bigint,
  amount numeric,
  payment payment_status,
  created_at timestamptz,
  paid_at timestamptz,
  order_status text,
  orderer_name text,
  orderer_role text
) as $$
begin
  if not (
    coalesce(is_admin(), false)
    or (current_customer_id() is not null and p_customer_id is not distinct from current_customer_id())
  ) then
    raise exception 'not authorized to read this history';
  end if;

  return query
    select
      o.id,
      o.order_number,
      order_total_with_vat(o.id),
      o.payment,
      o.created_at,
      o.paid_at,
      o.status::text,
      c.name,
      case
        when coalesce(c.staff_role, '') <> '' then c.staff_role
        when c.parent_customer_id is null then 'Руководитель'
        else ''
      end
    from orders o
    join customers c on c.id = o.customer_id
    where (
        case when coalesce(is_company_manager(p_customer_id), false)
          then company_root_id(o.customer_id) = company_root_id(p_customer_id)
          else o.customer_id = p_customer_id
        end
      )
      and o.payment_method = 'transfer'
    order by (o.payment = 'pending') desc, o.created_at desc;
end;
$$ language plpgsql security definer stable set search_path = public;

-- ---------------------------------------------------------------------------
-- 2) don't revive cancelled orders from the courier app
-- ---------------------------------------------------------------------------
create or replace function sync_order_status_from_delivery() returns trigger as $$
begin
  if new.status = 'delivered' and new.order_id is not null then
    update orders set status = 'delivered'
    where id = new.order_id and status not in ('delivered', 'cancelled');
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- 3) temporary login lock: 5 wrong passwords -> 15 minutes
-- ---------------------------------------------------------------------------
-- create or replace keeps the service_role-only grants from 0048/0050.
create or replace function public.check_login_lock(p_login text) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
      select 1 from customers
      where (lower(login) = lower(p_login) or lower(email) = lower(p_login))
        and login_locked_at > now() - interval '15 minutes'
    )
    or exists (
      select 1 from drivers
      where lower(login) = lower(p_login)
        and login_locked_at > now() - interval '15 minutes'
    );
$$;

create or replace function public.record_login_result(p_login text, p_success boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  -- In every SET below, column names refer to the row's values *before*
  -- this update. An expired lock counts as no lock: the next failure starts
  -- a fresh count at 1.
  if p_success then
    update customers set failed_login_attempts = 0, login_locked_at = null
      where (lower(login) = lower(p_login) or lower(email) = lower(p_login))
        and (login_locked_at is null or login_locked_at <= now() - interval '15 minutes');
    update drivers set failed_login_attempts = 0, login_locked_at = null
      where lower(login) = lower(p_login)
        and (login_locked_at is null or login_locked_at <= now() - interval '15 minutes');
  else
    update customers set
      failed_login_attempts = case
        when login_locked_at is not null and login_locked_at <= now() - interval '15 minutes' then 1
        else failed_login_attempts + 1
      end,
      login_locked_at = case
        when login_locked_at > now() - interval '15 minutes' then login_locked_at
        when login_locked_at is null and failed_login_attempts + 1 >= 5 then now()
        else null
      end
      where lower(login) = lower(p_login) or lower(email) = lower(p_login);
    update drivers set
      failed_login_attempts = case
        when login_locked_at is not null and login_locked_at <= now() - interval '15 minutes' then 1
        else failed_login_attempts + 1
      end,
      login_locked_at = case
        when login_locked_at > now() - interval '15 minutes' then login_locked_at
        when login_locked_at is null and failed_login_attempts + 1 >= 5 then now()
        else null
      end
      where lower(login) = lower(p_login);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) the driver guard trusts service_role, like the customer guard does
--    since 0055. guard_driver_privileged_fields (0035/0044) only let
--    is_admin() through, and is_admin() is always false for the service-role
--    client the edge functions use (no user JWT). So:
--    - delete-account failed for every courier (it blanks name/phone and
--      detaches auth_user_id) — the App Store requires that to work;
--    - the login function's failed-attempt counting never reached a
--      courier's row (record_login_result errored and was swallowed), so
--      couriers were never protected by the lockout at all.
--    Those edge functions check the caller themselves before writing.
-- ---------------------------------------------------------------------------
create or replace function guard_driver_privileged_fields() returns trigger as $$
begin
  if not (is_admin() or auth.role() = 'service_role') then
    if new.name is distinct from old.name
       or new.phone is distinct from old.phone
       or new.auth_user_id is distinct from old.auth_user_id
       or new.failed_login_attempts is distinct from old.failed_login_attempts
       or new.login_locked_at is distinct from old.login_locked_at then
      raise exception 'only an admin can change name, phone, auth_user_id, failed_login_attempts, or login_locked_at on a driver';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;
