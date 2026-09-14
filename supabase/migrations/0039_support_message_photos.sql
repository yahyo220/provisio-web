-- Provisio — lets a customer/courier attach one photo to a support message.
alter table support_messages add column if not exists photo_url text;

insert into storage.buckets (id, name, public)
values ('support-photos', 'support-photos', true)
on conflict (id) do nothing;

drop policy if exists "authenticated upload support photos" on storage.objects;
create policy "authenticated upload support photos" on storage.objects for insert
  with check (bucket_id = 'support-photos' and auth.role() = 'authenticated');

drop policy if exists "public read support photos" on storage.objects;
create policy "public read support photos" on storage.objects for select
  using (bucket_id = 'support-photos');
