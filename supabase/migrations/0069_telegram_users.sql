-- Freshline / Provisio — everyone who has opened the Telegram bot in a
-- private chat. /docs lists them as buttons, so an admin picks who receives
-- the order documents by name instead of typing a Telegram ID.

create table if not exists telegram_users (
  id bigint primary key,
  name text not null default '',
  username text,
  last_seen timestamptz not null default now()
);

alter table telegram_users enable row level security;
drop policy if exists "admin all telegram_users" on telegram_users;
create policy "admin all telegram_users" on telegram_users for all using (is_admin()) with check (is_admin());
insert into telegram_users (id, name) values (5608122161, 'Yahyo') on conflict (id) do nothing;
