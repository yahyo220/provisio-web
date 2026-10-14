-- Freshline / Provisio — people the owner allows to manage the Telegram bot
-- (link groups, choose who gets documents). The owner (TELEGRAM_ADMIN_IDS on
-- the function) toggles them with /admins.

alter table telegram_users add column if not exists is_admin boolean not null default false;
