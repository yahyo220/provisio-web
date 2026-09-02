-- Provisio — real photo uploads for products (add/replace/remove from the
-- product edit and add-product pages). Mirrors 0011_feedback_photos.sql's
-- pattern: a public bucket (product photos aren't sensitive, and a public
-- bucket lets both the app and the website show them via a plain URL with
-- no signed-URL juggling), writes restricted to admins since only the
-- dashboard manages the catalog.

insert into storage.buckets (id, name, public)
values ('product-photos', 'product-photos', true)
on conflict (id) do nothing;

drop policy if exists "admin manage product photos" on storage.objects;
create policy "admin manage product photos" on storage.objects for all
  using (bucket_id = 'product-photos' and is_admin())
  with check (bucket_id = 'product-photos' and is_admin());

drop policy if exists "public read product photos" on storage.objects;
create policy "public read product photos" on storage.objects for select
  using (bucket_id = 'product-photos');
