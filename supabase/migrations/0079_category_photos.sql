-- Freshline — category photos set from the Products page ("Фото категорий").
-- One row per products.category value; no row means the app shows its own
-- bundled photo for that category. Files live in the public product-photos
-- bucket under categories/ (admin-only writes, 0019).

create table if not exists public.category_photos (
  category text primary key,
  image_url text not null,
  updated_at timestamptz not null default now()
);

alter table public.category_photos enable row level security;

drop policy if exists "anyone reads category photos" on public.category_photos;
create policy "anyone reads category photos" on public.category_photos for select
  using (true);

drop policy if exists "admin manages category photos" on public.category_photos;
create policy "admin manages category photos" on public.category_photos for all
  using (is_admin())
  with check (is_admin());

grant select on public.category_photos to anon, authenticated;
grant insert, update, delete on public.category_photos to authenticated;
