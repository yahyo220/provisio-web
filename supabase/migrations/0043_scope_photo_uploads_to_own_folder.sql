-- Provisio / Freshline — feedback-photos (0011) and support-photos (0039)
-- let ANY authenticated user (any customer, or a courier) upload to ANY
-- path in the bucket — unlike avatars (0038), which correctly restricts the
-- upload path to the caller's own folder. A signed-in customer/courier
-- could plant a file under a path that looks like it belongs to a
-- different customer's feedback/support folder (both buckets are public
-- read). The actual order_feedback/support_messages rows stay correctly
-- scoped by customer_id — this only affects the storage object itself —
-- but it's still broken access control worth closing, and brings both
-- buckets in line with the avatars pattern.

drop policy if exists "customer upload feedback photos" on storage.objects;
create policy "customer upload feedback photos" on storage.objects for insert
  with check (
    bucket_id = 'feedback-photos'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = current_customer_id()::text
  );

-- support-photos is shared by both customers and couriers (the app uploads
-- to "$ownerId/..." where ownerId is whichever one is signed in — see
-- support_service.dart's send()), so either owner id is accepted here.
drop policy if exists "authenticated upload support photos" on storage.objects;
create policy "authenticated upload support photos" on storage.objects for insert
  with check (
    bucket_id = 'support-photos'
    and (
      (storage.foldername(name))[1] = current_customer_id()::text
      or (storage.foldername(name))[1] = current_driver_id()::text
    )
  );
