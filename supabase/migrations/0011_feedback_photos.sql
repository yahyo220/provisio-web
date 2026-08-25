-- Provisio — photo attachments for post-delivery feedback.

alter table order_feedback add column if not exists photo_urls text[] default '{}';

-- Public bucket: photos are just delivery-proof snapshots, not sensitive,
-- and a public bucket lets both the app and the website display them via a
-- plain URL without juggling signed URLs.
insert into storage.buckets (id, name, public)
values ('feedback-photos', 'feedback-photos', true)
on conflict (id) do nothing;

drop policy if exists "customer upload feedback photos" on storage.objects;
create policy "customer upload feedback photos" on storage.objects for insert
  with check (bucket_id = 'feedback-photos' and auth.role() = 'authenticated');

drop policy if exists "public read feedback photos" on storage.objects;
create policy "public read feedback photos" on storage.objects for select
  using (bucket_id = 'feedback-photos');
