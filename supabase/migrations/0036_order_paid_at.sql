-- Provisio — track *when* an order's payment was marked paid, so the app's
-- payment-history view can show a real date instead of just a status pill.
-- Set by a trigger (not the admin update call itself) so it stays correct
-- no matter which code path flips `payment` — the website's admin update,
-- a future bulk action, anything.

alter table orders add column if not exists paid_at timestamptz;

create or replace function set_order_paid_at() returns trigger as $$
begin
  if new.payment = 'paid' and old.payment is distinct from 'paid' then
    new.paid_at := now();
  elsif new.payment is distinct from 'paid' then
    -- Moved back off "paid" (e.g. admin correcting a mistake) — paid_at
    -- should only ever reflect a currently-true "paid" state.
    new.paid_at := null;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_set_order_paid_at on orders;
create trigger trg_set_order_paid_at
  before update on orders
  for each row
  execute function set_order_paid_at();
