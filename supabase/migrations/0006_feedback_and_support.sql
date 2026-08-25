-- Provisio — post-delivery feedback + customer support chat.
--
-- 1. order_feedback: the note a customer can leave after their order is
--    marked delivered (shown to the admin on that order's page).
-- 2. support_messages: a simple two-way chat per customer, so a shopper's
--    "message support" in the app shows up for the admin on the website,
--    and the admin's reply shows up back in the app.
--
-- Safe to re-run: guarded by drop-if-exists / create-if-not-exists.

create table if not exists order_feedback (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  message text not null default '',
  created_at timestamptz not null default now()
);

alter table order_feedback enable row level security;
drop policy if exists "admin full access" on order_feedback;
drop policy if exists "customer insert own feedback" on order_feedback;
drop policy if exists "customer select own feedback" on order_feedback;
create policy "admin full access" on order_feedback for all using (is_admin()) with check (is_admin());
create policy "customer insert own feedback" on order_feedback for insert
  with check (customer_id = current_customer_id() and exists (
    select 1 from orders o where o.id = order_id and o.customer_id = current_customer_id()
  ));
create policy "customer select own feedback" on order_feedback for select using (customer_id = current_customer_id());

create table if not exists support_messages (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  sender text not null check (sender in ('customer','admin')),
  message text not null,
  created_at timestamptz not null default now()
);

alter table support_messages enable row level security;
drop policy if exists "admin full access" on support_messages;
drop policy if exists "customer select own messages" on support_messages;
drop policy if exists "customer insert own messages" on support_messages;
create policy "admin full access" on support_messages for all using (is_admin()) with check (is_admin());
create policy "customer select own messages" on support_messages for select
  using (customer_id = current_customer_id());
create policy "customer insert own messages" on support_messages for insert
  with check (customer_id = current_customer_id() and sender = 'customer');
