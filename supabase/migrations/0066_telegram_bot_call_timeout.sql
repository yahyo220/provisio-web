-- Freshline / Provisio — give the database's calls to the telegram-bot
-- function more than pg_net's default 5 seconds (the bot now answers at once
-- and builds the PDFs afterwards, but a cold start can still take a while).

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
    body := p_body,
    timeout_milliseconds := 60000
  );
end;
$$;

revoke all on function public.notify_telegram_bot(jsonb) from public, anon, authenticated;
