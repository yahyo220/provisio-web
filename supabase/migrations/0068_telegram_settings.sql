-- Freshline / Provisio — settings the Telegram bot keeps for itself, so an
-- admin can change them from Telegram: for now who receives the nightly order
-- documents (docs_chat_id, set with /docs). Falls back to the
-- TELEGRAM_DOCS_CHAT_ID secret when unset.

create table if not exists telegram_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table telegram_settings enable row level security;
drop policy if exists "admin all telegram_settings" on telegram_settings;
create policy "admin all telegram_settings" on telegram_settings for all using (is_admin()) with check (is_admin());

insert into telegram_settings (key, value) values ('docs_chat_id', '5608122161') on conflict (key) do nothing;
