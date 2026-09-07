-- Provisio — bank transfer ("Перечисление") is a payment method a customer
-- has to request in the app before they can use it; an admin then grants
-- (or revokes) it per-customer on the website. `requested` flips back to
-- false once granted (or once the admin dismisses it) so it only ever
-- reflects a *pending* ask, not history.

alter table customers add column if not exists bank_transfer_enabled boolean not null default false;
alter table customers add column if not exists bank_transfer_requested boolean not null default false;

-- "customer update own" (0002_roles_auth.sql) lets a signed-in customer
-- update any column on their own row -- the existing privileged-fields
-- trigger is what actually stops them from granting themselves things like
-- approval_status or price_tier. Extend that same trigger to cover
-- bank_transfer_enabled too, so a customer can only ever *request* it
-- (bank_transfer_requested, left freely editable) and never grant it to
-- themselves directly.
create or replace function guard_customer_privileged_fields() returns trigger as $$
begin
  if not is_admin() then
    if tg_op = 'UPDATE' then
      if new.approval_status is distinct from old.approval_status
         or new.price_tier is distinct from old.price_tier
         or new.bank_transfer_enabled is distinct from old.bank_transfer_enabled then
        raise exception 'only an admin can change approval_status, price_tier, or bank_transfer_enabled';
      end if;
    elsif tg_op = 'INSERT' then
      new.approval_status := 'pending';
      new.price_tier := 'no_price';
      new.bank_transfer_enabled := false;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;
