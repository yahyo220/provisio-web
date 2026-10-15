-- Freshline / Provisio — the documents group gets each order's накладная
-- right away, and a fresh one replaces it whenever the order changes (lines
-- edited on the website, a follow-up message in Telegram, the client chosen
-- later) — the bot deletes its previous file. A cancelled or deleted order's
-- file is removed.
--
-- Every change queues the order in telegram_doc_pending with the time of the
-- request and pings the bot. One website save touches order_items in up to
-- three statements, so the bot waits a few seconds and only the newest
-- request for an order actually sends.

create table if not exists telegram_doc_messages (
  order_id uuid not null,
  chat_id bigint not null,
  message_id bigint not null,
  sent_at timestamptz not null default now(),
  primary key (order_id, chat_id)
);
alter table telegram_doc_messages enable row level security;
drop policy if exists "admin all telegram_doc_messages" on telegram_doc_messages;
create policy "admin all telegram_doc_messages" on telegram_doc_messages for all using (is_admin()) with check (is_admin());

create table if not exists telegram_doc_pending (
  order_id uuid primary key,
  requested_at timestamptz not null
);
alter table telegram_doc_pending enable row level security;
drop policy if exists "admin all telegram_doc_pending" on telegram_doc_pending;
create policy "admin all telegram_doc_pending" on telegram_doc_pending for all using (is_admin()) with check (is_admin());

create or replace function public.queue_order_document(p_order_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_at timestamptz := clock_timestamp();
begin
  insert into telegram_doc_pending (order_id, requested_at) values (p_order_id, v_at)
  on conflict (order_id) do update set requested_at = excluded.requested_at;
  perform public.notify_telegram_bot(jsonb_build_object('kind', 'order', 'order_id', p_order_id, 'requested_at', v_at));
end;
$$;
revoke all on function public.queue_order_document(uuid) from public, anon, authenticated;

-- Statement-level: once per statement for each order it touched.
create or replace function public.order_items_queue_documents() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in select distinct order_id from changed where order_id is not null loop
    perform public.queue_order_document(r.order_id);
  end loop;
  return null;
end;
$$;

drop trigger if exists order_items_documents_ins on order_items;
create trigger order_items_documents_ins after insert on order_items
  referencing new table as changed for each statement execute function public.order_items_queue_documents();
drop trigger if exists order_items_documents_upd on order_items;
create trigger order_items_documents_upd after update on order_items
  referencing new table as changed for each statement execute function public.order_items_queue_documents();
drop trigger if exists order_items_documents_del on order_items;
create trigger order_items_documents_del after delete on order_items
  referencing old table as changed for each statement execute function public.order_items_queue_documents();

-- A cancelled order: its file goes away (the bot sees the status).
create or replace function public.order_cancel_queue_document() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.queue_order_document(new.id);
  return new;
end;
$$;
drop trigger if exists orders_cancel_document on orders;
create trigger orders_cancel_document after update of status on orders
  for each row when (new.status = 'cancelled' and old.status is distinct from 'cancelled')
  execute function public.order_cancel_queue_document();
