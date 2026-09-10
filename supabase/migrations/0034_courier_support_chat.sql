-- Provisio — extends the customer↔admin support chat (0006_feedback_and_support.sql)
-- so a courier can message support too, and the admin can tell the two
-- apart on the website. Same table, same realtime subscription mechanics —
-- just a second, mutually-exclusive owner column.

alter table support_messages alter column customer_id drop not null;
alter table support_messages add column if not exists driver_id uuid references drivers(id) on delete cascade;

alter table support_messages drop constraint if exists support_messages_one_owner;
alter table support_messages add constraint support_messages_one_owner
  check ((customer_id is not null) <> (driver_id is not null));

alter table support_messages drop constraint if exists support_messages_sender_check;
alter table support_messages add constraint support_messages_sender_check
  check (sender in ('customer', 'driver', 'admin'));

drop policy if exists "customer select own messages" on support_messages;
drop policy if exists "customer insert own messages" on support_messages;
create policy "customer select own messages" on support_messages for select
  using (customer_id = current_customer_id());
create policy "customer insert own messages" on support_messages for insert
  with check (customer_id = current_customer_id() and sender = 'customer');

drop policy if exists "courier select own messages" on support_messages;
drop policy if exists "courier insert own messages" on support_messages;
create policy "courier select own messages" on support_messages for select
  using (driver_id = current_driver_id());
create policy "courier insert own messages" on support_messages for insert
  with check (driver_id = current_driver_id() and sender = 'driver');
