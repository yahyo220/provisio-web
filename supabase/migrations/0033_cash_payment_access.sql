-- Provisio — cash on delivery ("Наличными курьеру") now needs the exact
-- same admin request/grant gate as bank transfer (0022_bank_transfer_access.sql):
-- card payments are gone entirely, so a brand-new customer must not be able
-- to place *any* order until an admin has granted at least one payment
-- method. `requested` flips back to false once granted (or dismissed) so it
-- only ever reflects a *pending* ask, not history.

alter table customers add column if not exists cash_enabled boolean not null default false;
alter table customers add column if not exists cash_requested boolean not null default false;

-- Extend the same privileged-fields trigger used for bank_transfer_enabled
-- so a customer can only ever *request* cash (cash_requested, left freely
-- editable) and never grant it to themselves directly.
create or replace function guard_customer_privileged_fields() returns trigger as $$
begin
  if not is_admin() then
    if tg_op = 'UPDATE' then
      if new.approval_status is distinct from old.approval_status
         or new.price_tier is distinct from old.price_tier
         or new.bank_transfer_enabled is distinct from old.bank_transfer_enabled
         or new.cash_enabled is distinct from old.cash_enabled then
        raise exception 'only an admin can change approval_status, price_tier, bank_transfer_enabled, or cash_enabled';
      end if;
    elsif tg_op = 'INSERT' then
      new.approval_status := 'pending';
      new.price_tier := 'no_price';
      new.bank_transfer_enabled := false;
      new.cash_enabled := false;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;
