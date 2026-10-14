-- Freshline / Provisio — order documents by Telegram.
--
-- One person (TELEGRAM_DOCS_CHAT_ID on the telegram-bot function) gets:
--   * every order's накладная as a PDF right after it's placed. Orders from
--     Telegram groups are sent by the bot itself (also after a follow-up
--     message adds lines); orders from the app come through the trigger
--     below.
--   * every day at 03:00 Tashkent time, "Товары по заказам": everything in
--     the orders not delivered yet, added up.
-- Both calls carry the same x-webhook-secret as the push trigger (0014).

create or replace function public.notify_telegram_bot(p_body jsonb) returns void
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  secret text;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'webhook_secret';
  perform net.http_post(
    url := 'https://rxelhzamhwmnkqrhxgmc.supabase.co/functions/v1/telegram-bot',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', coalesce(secret, '')),
    body := p_body
  );
end;
$$;

revoke all on function public.notify_telegram_bot(jsonb) from public, anon, authenticated;

create or replace function public.order_document_on_insert() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Sent after the transaction commits (pg_net), so the order's lines,
  -- inserted right after it by place_order, are there by then.
  perform public.notify_telegram_bot(jsonb_build_object('kind', 'order', 'order_id', new.id));
  return new;
end;
$$;

drop trigger if exists orders_document_to_telegram on orders;
create trigger orders_document_to_telegram
  after insert on orders
  for each row
  when (new.source is distinct from 'telegram')
  execute function public.order_document_on_insert();

create extension if not exists pg_cron;

-- 22:00 UTC = 03:00 in Tashkent.
select cron.unschedule('telegram-daily-summary') where exists (select 1 from cron.job where jobname = 'telegram-daily-summary');
select cron.schedule('telegram-daily-summary', '0 22 * * *', $$select public.notify_telegram_bot('{"kind":"daily"}'::jsonb)$$);
