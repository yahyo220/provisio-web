-- Freshline — a real in-app notifications inbox, plus "read" tracking for
-- support replies, plus a fix so cancelled orders never count as debt.
--
-- Before this, pushes were fire-and-forget: send-push (edge function) sent
-- an FCM message and nothing was stored, so the app's Notifications panel
-- (which was just a static recap of the last order) never showed what had
-- actually been pushed. Now send-push also inserts a row here for every
-- push it sends (service role — there is deliberately NO insert policy for
-- customers/drivers), and the app reads its own rows back.

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete cascade,
  driver_id uuid references drivers(id) on delete cascade,
  type text not null default 'info',
  title text not null,
  body text not null default '',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint notifications_one_owner check ((customer_id is not null) <> (driver_id is not null))
);

create index if not exists notifications_customer_idx on notifications (customer_id, created_at desc);
create index if not exists notifications_driver_idx on notifications (driver_id, created_at desc);

alter table notifications enable row level security;

drop policy if exists "customer select own notifications" on notifications;
create policy "customer select own notifications" on notifications for select
  using (customer_id = current_customer_id());

drop policy if exists "driver select own notifications" on notifications;
create policy "driver select own notifications" on notifications for select
  using (driver_id = current_driver_id());

drop policy if exists "admin select notifications" on notifications;
create policy "admin select notifications" on notifications for select
  using (coalesce(is_admin(), false));

-- Marks the caller's own unread notifications as read. A plain UPDATE from
-- the app isn't possible (no update policy on purpose), and a NULL result
-- from current_customer_id()/current_driver_id() compares as NULL, which
-- WHERE treats as "not matched" — so this can never touch anyone else's rows.
create or replace function mark_notifications_read() returns void
language plpgsql security definer set search_path = public as $$
begin
  update notifications
     set read_at = now()
   where read_at is null
     and (customer_id = current_customer_id() or driver_id = current_driver_id());
end;
$$;
revoke all on function mark_notifications_read() from public;
grant execute on function mark_notifications_read() to authenticated;

-- Support replies: the red dot on the app's "Поддержка" row lights up while
-- the admin has written something the customer/courier hasn't opened yet,
-- and clears once they open the chat.
alter table support_messages add column if not exists read_at timestamptz;

-- Everything the admin already wrote before this existed counts as seen —
-- otherwise every account would light up on first launch for old history.
update support_messages set read_at = now() where sender = 'admin' and read_at is null;

create or replace function mark_support_messages_read() returns void
language plpgsql security definer set search_path = public as $$
begin
  update support_messages
     set read_at = now()
   where read_at is null
     and sender = 'admin'
     and (customer_id = current_customer_id() or driver_id = current_driver_id());
end;
$$;
revoke all on function mark_support_messages_read() from public;
grant execute on function mark_support_messages_read() to authenticated;

-- A cancelled order can't be owed — without this a cancelled "Перечисление"
-- order (payment still 'pending' forever) kept the red "you owe money" dot
-- lit even after everything real had been paid.
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
      and o.status <> 'cancelled'
  ), 0);
end;
$$ language plpgsql security definer stable set search_path = public;

-- Live updates: the app subscribes to its own notifications (new-message
-- red dot) and its own orders (the "you owe" dot clears the moment an admin
-- marks an order paid, instead of only after a restart).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table notifications;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table orders;
  end if;
end $$;
