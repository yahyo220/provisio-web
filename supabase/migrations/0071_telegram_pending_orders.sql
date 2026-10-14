-- Freshline / Provisio — orders from a Telegram group nobody has linked yet.
-- Instead of needing /link first, the bot keeps the message here, asks the
-- admins in private which client the group belongs to (buttons), and places
-- the waiting orders as soon as one of them answers.

create table if not exists telegram_pending (
  id bigserial primary key,
  chat_id bigint not null,
  chat_title text,
  message_id bigint not null,
  text text not null,
  created_at timestamptz not null default now()
);
create index if not exists telegram_pending_chat_idx on telegram_pending (chat_id);

alter table telegram_pending enable row level security;
drop policy if exists "admin all telegram_pending" on telegram_pending;
create policy "admin all telegram_pending" on telegram_pending for all using (is_admin()) with check (is_admin());
