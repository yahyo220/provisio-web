-- Provisio — initial schema
-- Run this once in the Supabase project's SQL editor (or via `supabase db push`
-- once the Supabase CLI is linked to the project).

create extension if not exists pgcrypto;

create type order_status as enum ('new','confirmed','preparing','ready','out','delivered','cancelled');
create type payment_status as enum ('paid','pending','overdue');
create type stock_status as enum ('in','low','out');
create type customer_status as enum ('active','inactive');
create type delivery_status as enum ('scheduled','in-transit','delayed','delivered','cancelled');

create table customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null,
  contact text,
  phone text,
  email text,
  location text,
  status customer_status not null default 'active',
  created_at timestamptz not null default now()
);

create table products (
  id uuid primary key default gen_random_uuid(),
  sku text unique not null,
  name text not null,
  category text not null,
  price numeric(10,2) not null,
  unit text not null,
  stock stock_status not null default 'in',
  active boolean not null default true,
  image_url text,
  updated_at timestamptz not null default now()
);

create table drivers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigserial unique,
  customer_id uuid references customers(id),
  status order_status not null default 'new',
  payment payment_status not null default 'pending',
  delivery_address text,
  delivery_fee numeric(10,2) not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id),
  name text not null,
  sku text,
  qty integer not null default 1,
  unit text not null,
  unit_price numeric(10,2) not null,
  image_url text
);

create table deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id),
  driver_id uuid references drivers(id),
  address text,
  eta text,
  status delivery_status not null default 'scheduled',
  created_at timestamptz not null default now()
);

-- Keep products.updated_at fresh automatically.
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger products_set_updated_at
  before update on products
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Every table starts world-readable/writable to the anon key so the web
-- dashboard and the Flutter app can talk to it immediately during setup.
-- Before handling real customer data or payments, replace these permissive
-- policies with ones scoped to an authenticated staff role (dashboard) and
-- an authenticated customer role (app) — see the TODO further down.

alter table customers enable row level security;
alter table products enable row level security;
alter table drivers enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table deliveries enable row level security;

create policy "anon full access" on customers for all using (true) with check (true);
create policy "anon full access" on products for all using (true) with check (true);
create policy "anon full access" on drivers for all using (true) with check (true);
create policy "anon full access" on orders for all using (true) with check (true);
create policy "anon full access" on order_items for all using (true) with check (true);
create policy "anon full access" on deliveries for all using (true) with check (true);

-- TODO before real launch: drop the "anon full access" policies above and add
-- role-scoped ones instead, e.g.:
--   create policy "staff read/write" on orders for all
--     using (auth.jwt() ->> 'role' = 'staff') with check (auth.jwt() ->> 'role' = 'staff');
--   create policy "customers see their own orders" on orders for select
--     using (customer_id = auth.uid());
