-- Provisio — roles & auth foundation
-- Run this once in the Supabase project's SQL editor, after 0001_init.sql.
--
-- Adds three things:
--   1. Real login for three kinds of users: admin (you, on the website),
--      courier (delivery staff, in the app), customer (shoppers, in the app).
--      Each links to a Supabase Auth user via auth_user_id.
--   2. Customer onboarding gate: new sign-ups start as 'pending' and can't
--      place orders until you approve them and pick a price_tier.
--   3. Row Level Security scoped to those roles, replacing the old
--      "anon full access" policies from 0001_init.sql.

-- ---------------------------------------------------------------------------
-- Schema additions
-- ---------------------------------------------------------------------------

create type approval_status as enum ('pending', 'approved', 'suspended');
create type price_tier as enum ('with_price', 'no_price', 'external');

-- Membership in this table is what makes someone an admin (you). There is no
-- self-service way to join it — rows are added by hand in the SQL editor
-- (see the bootstrap note at the bottom of this file) or by an existing admin
-- via the service-role edge function.
create table admin_users (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  name text,
  created_at timestamptz not null default now()
);

alter table customers
  add column auth_user_id uuid unique references auth.users(id) on delete set null,
  add column approval_status approval_status not null default 'pending',
  add column price_tier price_tier not null default 'no_price';

alter table drivers
  add column auth_user_id uuid unique references auth.users(id) on delete set null,
  add column active boolean not null default true;

-- Optional wholesale/external price. Falls back to the regular `price` when
-- null — most products won't need a separate external price.
alter table products
  add column price_external numeric(10,2);

-- ---------------------------------------------------------------------------
-- Helper functions (security definer so they can read admin_users/customers/
-- drivers regardless of the caller's own RLS visibility into those tables)
-- ---------------------------------------------------------------------------

create or replace function is_admin() returns boolean as $$
  select exists (select 1 from admin_users where auth_user_id = auth.uid());
$$ language sql security definer stable set search_path = public;

create or replace function current_customer_id() returns uuid as $$
  select id from customers where auth_user_id = auth.uid();
$$ language sql security definer stable set search_path = public;

create or replace function current_driver_id() returns uuid as $$
  select id from drivers where auth_user_id = auth.uid();
$$ language sql security definer stable set search_path = public;

-- Stops a customer from approving/pricing themselves by editing their own
-- row — only an admin (or the service-role edge function) may change
-- approval_status or price_tier.
create or replace function guard_customer_privileged_fields() returns trigger as $$
begin
  if not is_admin() then
    if tg_op = 'UPDATE' then
      if new.approval_status is distinct from old.approval_status
         or new.price_tier is distinct from old.price_tier then
        raise exception 'only an admin can change approval_status or price_tier';
      end if;
    elsif tg_op = 'INSERT' then
      new.approval_status := 'pending';
      new.price_tier := 'no_price';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger customers_guard_privileged_fields
  before insert or update on customers
  for each row execute function guard_customer_privileged_fields();

-- ---------------------------------------------------------------------------
-- Row Level Security — replaces the "anon full access" policies from 0001
-- ---------------------------------------------------------------------------

drop policy if exists "anon full access" on customers;
drop policy if exists "anon full access" on products;
drop policy if exists "anon full access" on drivers;
drop policy if exists "anon full access" on orders;
drop policy if exists "anon full access" on order_items;
drop policy if exists "anon full access" on deliveries;

-- customers: admin sees/edits everyone; a signed-in customer sees/edits only
-- their own row (privileged fields protected by the trigger above); a
-- customer can also create their own row once, at sign-up.
create policy "admin full access" on customers for all using (is_admin()) with check (is_admin());
create policy "customer select own" on customers for select using (auth_user_id = auth.uid());
create policy "customer update own" on customers for update using (auth_user_id = auth.uid());
create policy "customer insert own" on customers for insert with check (auth_user_id = auth.uid());

-- products: admin full access; anyone signed in (customer or courier) can
-- browse active products. Price *values* are still returned by the row —
-- the app decides what to show based on the customer's price_tier.
create policy "admin full access" on products for all using (is_admin()) with check (is_admin());
create policy "authenticated read active products" on products for select
  using (auth.role() = 'authenticated' and active = true);

-- drivers: admin full access; a courier can see (and update, e.g. their
-- phone) only their own row.
create policy "admin full access" on drivers for all using (is_admin()) with check (is_admin());
create policy "driver select own" on drivers for select using (auth_user_id = auth.uid());
create policy "driver update own" on drivers for update using (auth_user_id = auth.uid());

-- orders: admin full access; a customer sees/creates only their own orders,
-- and only once approved; a courier sees only orders they have an assigned
-- delivery for.
create policy "admin full access" on orders for all using (is_admin()) with check (is_admin());
create policy "customer select own orders" on orders for select
  using (customer_id = current_customer_id());
create policy "customer insert own orders" on orders for insert
  with check (
    customer_id = current_customer_id()
    and exists (select 1 from customers c where c.id = customer_id and c.approval_status = 'approved')
  );
create policy "courier select assigned orders" on orders for select
  using (exists (
    select 1 from deliveries d where d.order_id = orders.id and d.driver_id = current_driver_id()
  ));

-- order_items: same visibility as the parent order.
create policy "admin full access" on order_items for all using (is_admin()) with check (is_admin());
create policy "customer select own order items" on order_items for select
  using (exists (select 1 from orders o where o.id = order_items.order_id and o.customer_id = current_customer_id()));
create policy "customer insert own order items" on order_items for insert
  with check (exists (select 1 from orders o where o.id = order_items.order_id and o.customer_id = current_customer_id()));
create policy "courier select assigned order items" on order_items for select
  using (exists (
    select 1 from deliveries d where d.order_id = order_items.order_id and d.driver_id = current_driver_id()
  ));

-- deliveries: admin full access; a courier sees and updates (e.g. marks
-- delivered) only deliveries assigned to them.
create policy "admin full access" on deliveries for all using (is_admin()) with check (is_admin());
create policy "courier select own deliveries" on deliveries for select using (driver_id = current_driver_id());
create policy "courier update own deliveries" on deliveries for update using (driver_id = current_driver_id());

-- Lets the website call `supabase.rpc('is_admin')` to check whether the
-- signed-in user is an admin (used to gate the whole dashboard behind auth).
grant execute on function is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Bootstrap: make yourself an admin
-- ---------------------------------------------------------------------------
-- 1. In the Supabase dashboard: Authentication → Users → Add user, create
--    your own admin login (email + password).
-- 2. Copy that user's UID, then run (also in the SQL editor):
--      insert into admin_users (auth_user_id, name) values ('<uid-here>', 'Admin');
