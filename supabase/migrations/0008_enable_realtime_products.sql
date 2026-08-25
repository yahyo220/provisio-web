-- Provisio — enable Realtime for products.
--
-- The app's shopping catalog now subscribes to live changes on `products`
-- (state/catalog_controller.dart) so admin edits on the ops dashboard show
-- up for shoppers without a restart. Same gotcha as support_messages: a
-- table isn't live for Realtime subscribers until it's added to the
-- `supabase_realtime` publication.
--
-- Safe to re-run: skips the ALTER if the table is already in the publication.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'products'
  ) then
    alter publication supabase_realtime add table products;
  end if;
end $$;
