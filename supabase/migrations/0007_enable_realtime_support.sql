-- Provisio — enable Realtime for support_messages.
--
-- Without this, both the app's chat screen and the website's Support page
-- try to subscribe to live changes on a table that was never added to the
-- `supabase_realtime` publication, and the subscription just errors out
-- (harmlessly now that the app guards against it, but it means replies
-- never show up live — only after a manual refresh).
--
-- Safe to re-run: skips the ALTER if the table is already in the publication.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'support_messages'
  ) then
    alter publication supabase_realtime add table support_messages;
  end if;
end $$;
