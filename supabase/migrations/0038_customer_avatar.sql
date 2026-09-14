-- Provisio — lets a customer set their own profile photo, shown in the app.
-- Not a privileged field — guard_customer_privileged_fields() only blocks
-- approval_status/price_tier/bank_transfer_enabled/cash_enabled, so the
-- existing "customer update own row" RLS policy already allows this.

alter table customers add column if not exists avatar_url text;

-- Public bucket, same reasoning as feedback-photos (0011): a profile photo
-- isn't sensitive, and a public bucket lets the app and the admin website
-- both display it via a plain URL. One file per customer, named by their
-- own id, so a re-upload can just overwrite it (upsert) instead of
-- accumulating old photos.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "customer upload own avatar" on storage.objects;
create policy "customer upload own avatar" on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = current_customer_id()::text
  );

drop policy if exists "customer replace own avatar" on storage.objects;
create policy "customer replace own avatar" on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = current_customer_id()::text
  );

drop policy if exists "public read avatars" on storage.objects;
create policy "public read avatars" on storage.objects for select
  using (bucket_id = 'avatars');
