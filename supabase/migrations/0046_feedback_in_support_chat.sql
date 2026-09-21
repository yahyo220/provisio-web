-- Freshline — an order review now also lands in the support chat.
--
-- When a customer leaves feedback for a delivered order (order_feedback), a
-- "Отзыв за заказ №N" message is added to that customer's support thread,
-- linked to the review by support_messages.feedback_id. In the admin panel
-- that message shows up lit and opens the review + photos on click; in the
-- app the same bubble opens the review the customer sent.
--
-- Also: `read_at` is now used on the *admin's* side too. A message sent by a
-- customer/courier is "read" once the admin has opened it — so a thread's
-- unread dot clears when the admin looks at it, not only once they reply.
-- (For messages sent by the admin, read_at keeps meaning "the customer/courier
-- opened the chat" — see 0045.)

alter table support_messages
  add column if not exists feedback_id uuid references order_feedback(id) on delete cascade;

create index if not exists support_messages_feedback_idx
  on support_messages (feedback_id) where feedback_id is not null;

-- Keep today's admin-side unread state exactly as it is: an existing
-- customer/courier message counts as already read only if the admin has
-- replied after it (that was the old "read" rule).
update support_messages m
   set read_at = now()
 where m.sender <> 'admin'
   and m.read_at is null
   and exists (
     select 1 from support_messages a
      where a.sender = 'admin'
        and coalesce(a.customer_id, a.driver_id) = coalesce(m.customer_id, m.driver_id)
        and a.created_at > m.created_at
   );

-- Mirrors each new review into the customer's support thread. SECURITY
-- DEFINER because the customer's own insert policy on support_messages only
-- allows plain typed messages. Wrapped so that a problem here can never make
-- the review itself fail to save.
create or replace function order_feedback_to_support() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  if new.customer_id is null then
    return new;
  end if;
  begin
    select order_number into n from orders where id = new.order_id;
    insert into support_messages (customer_id, sender, message, feedback_id)
    values (
      new.customer_id,
      'customer',
      case when n is not null then 'Отзыв за заказ №' || n else 'Отзыв за заказ' end,
      new.id
    );
  exception when others then
    raise warning 'order_feedback_to_support failed: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists order_feedback_to_support_trg on order_feedback;
create trigger order_feedback_to_support_trg
  after insert on order_feedback
  for each row execute function order_feedback_to_support();
