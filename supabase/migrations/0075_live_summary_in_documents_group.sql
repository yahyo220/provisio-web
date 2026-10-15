-- Freshline / Provisio — the documents group keeps one live "Товары по
-- заказам" for the night window (17:00–03:00 Tashkent): every order change
-- in the window replaces it (the bot deletes its previous message), and at
-- 03:00 it is replaced one last time by the final version.

create table if not exists telegram_summary_messages (
  window_start timestamptz not null,
  chat_id bigint not null,
  message_id bigint not null,
  sent_at timestamptz not null default now(),
  primary key (window_start, chat_id)
);
alter table telegram_summary_messages enable row level security;
drop policy if exists "admin all telegram_summary_messages" on telegram_summary_messages;
create policy "admin all telegram_summary_messages" on telegram_summary_messages for all using (is_admin()) with check (is_admin());

-- Several orders changing at once: only the newest refresh request sends.
create table if not exists telegram_summary_pending (
  window_start timestamptz primary key,
  requested_at timestamptz not null
);
alter table telegram_summary_pending enable row level security;
drop policy if exists "admin all telegram_summary_pending" on telegram_summary_pending;
create policy "admin all telegram_summary_pending" on telegram_summary_pending for all using (is_admin()) with check (is_admin());
