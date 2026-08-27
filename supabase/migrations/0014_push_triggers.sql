-- Freshline — push notification triggers.
--
-- The dashboard's "Database Webhooks" page wasn't available in this
-- project's current UI, so this does the same thing Database Webhooks does
-- under the hood: a trigger function that calls the send-push edge
-- function via pg_net (already enabled on every Supabase project).
--
-- The shared secret the function checks (see supabase/functions/send-push)
-- is deliberately NOT in this file — it's set once via
--   alter database postgres set app.settings.webhook_secret = '...';
-- run directly against the project, so it never ends up committed to git.
-- If you ever rotate WEBHOOK_SECRET (functions secret), re-run that ALTER
-- with the new value too.

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_send_push() returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  payload jsonb;
begin
  payload := jsonb_build_object(
    'type', tg_op,
    'table', tg_table_name,
    'schema', tg_table_schema,
    'record', case when tg_op = 'DELETE' then null else to_jsonb(new) end,
    'old_record', case when tg_op = 'INSERT' then null else to_jsonb(old) end
  );

  perform net.http_post(
    url := 'https://rxelhzamhwmnkqrhxgmc.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', coalesce(current_setting('app.settings.webhook_secret', true), '')
    ),
    body := payload
  );

  return coalesce(new, old);
end;
$$;

-- One trigger per table this app cares about — see the "Function to
-- trigger" step in the Triggers UI; these are created here so nobody has
-- to click through that UI by hand.

drop trigger if exists push_on_order_update on orders;
create trigger push_on_order_update
  after update on orders
  for each row execute function public.notify_send_push();

drop trigger if exists push_on_customer_update on customers;
create trigger push_on_customer_update
  after update on customers
  for each row execute function public.notify_send_push();

drop trigger if exists push_on_support_message_insert on support_messages;
create trigger push_on_support_message_insert
  after insert on support_messages
  for each row execute function public.notify_send_push();

drop trigger if exists push_on_delivery_change on deliveries;
create trigger push_on_delivery_change
  after insert or update on deliveries
  for each row execute function public.notify_send_push();
