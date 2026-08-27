-- Freshline — push notifications: read the webhook secret from Supabase
-- Vault instead of a database GUC (ALTER DATABASE ... SET was rejected —
-- hosted Supabase doesn't grant that to the migration role). The secret
-- itself was stored once via `select vault.create_secret(...)`, run
-- directly against the project (not committed — see 0014's comment, which
-- is now superseded by this file for how the secret is actually read).

create or replace function public.notify_send_push() returns trigger
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  payload jsonb;
  secret text;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'webhook_secret';

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
      'x-webhook-secret', coalesce(secret, '')
    ),
    body := payload
  );

  return coalesce(new, old);
end;
$$;
