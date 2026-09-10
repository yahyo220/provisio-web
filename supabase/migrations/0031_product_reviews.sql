-- Provisio / Freshline — real product ratings + comments, replacing the
-- app's hardcoded "Рейтинг 4.7" placeholder and "Freshline" vendor label
-- on the product detail screen with an actual per-customer review.
--
-- One review per customer per product (the unique constraint) — submitting
-- again from the app is an upsert that edits their existing review rather
-- than piling up duplicates from the same shared-login account.
create table if not exists product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, customer_id)
);

create index if not exists product_reviews_product_id_idx on product_reviews (product_id);

alter table product_reviews enable row level security;

-- Star average + comment list are shown to every shopper on every product,
-- signed in or not — reading needs no restriction.
drop policy if exists "public read reviews" on product_reviews;
create policy "public read reviews" on product_reviews for select using (true);

-- A customer can only ever write/edit/delete their own review. NULL from
-- current_customer_id() (a courier or admin session, not a customer) makes
-- these compare to NULL, which Postgres RLS treats as "deny", not "allow" —
-- unlike the plpgsql `if not (...)` gotcha fixed in 0025, a bare NULL in a
-- USING/WITH CHECK clause is already a safe default here.
drop policy if exists "customers insert own reviews" on product_reviews;
create policy "customers insert own reviews" on product_reviews for insert
  with check (customer_id = current_customer_id());

drop policy if exists "customers update own reviews" on product_reviews;
create policy "customers update own reviews" on product_reviews for update
  using (customer_id = current_customer_id())
  with check (customer_id = current_customer_id());

drop policy if exists "customers delete own reviews" on product_reviews;
create policy "customers delete own reviews" on product_reviews for delete
  using (customer_id = current_customer_id());

-- Basic moderation hook for later — no admin UI for this yet, but an admin
-- can already remove an abusive review directly if it comes up.
drop policy if exists "admin delete any review" on product_reviews;
create policy "admin delete any review" on product_reviews for delete
  using (coalesce(is_admin(), false));
