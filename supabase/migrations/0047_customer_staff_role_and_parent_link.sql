-- Freshline / Provisio — two things:
--
-- 1. "Должность" (staff_role) at app registration is now a fixed choice —
--    Повар / Бармен / Руководитель — instead of free text. The column
--    itself stays a plain `text` (simplest place to enforce "one of these
--    three" is the app's own picker UI, same as every other fixed-choice
--    field in this schema, e.g. price_tier's UI dropdown vs its enum) — a
--    check constraint would also reject the empty string this column has
--    always allowed for "didn't say."
--
-- 2. `parent_customer_id`: when several people at the same business each
--    register their own login (a cook, a bartender, the manager), the admin
--    can link the later ones to the first instead of every one of them
--    becoming its own client on the website. A linked row keeps its own
--    login, its own price_tier/approval — visibility still follows the
--    person's own role, exactly like an unlinked account — it just stops
--    showing up as a separate top-level client; the website lists it under
--    its parent's detail page instead. Deliberately NOT touched by this
--    migration: orders/накладные — a linked person's orders stay filed
--    under their own customer_id, not folded into the parent's. Consolidating
--    those is a bigger follow-up (touches RLS + every "per customer" export)
--    and wasn't asked for — only "stop showing as a separate client."

alter table customers add column if not exists parent_customer_id uuid references customers(id) on delete set null;

-- A customer can't be its own parent, and (kept single-level on purpose,
-- simplest to reason about and to render on the website) can't link to a
-- row that is itself already linked to something else.
alter table customers drop constraint if exists customers_parent_not_self;
alter table customers add constraint customers_parent_not_self check (parent_customer_id is distinct from id);

create index if not exists customers_parent_customer_id_idx on customers (parent_customer_id) where parent_customer_id is not null;

-- Guard it exactly like approval_status/price_tier/etc. above — only an
-- admin may link (or re-link/unlink) a customer to a parent. Without this a
-- customer could set their own parent_customer_id directly (RLS already lets
-- a customer update their own row) and attach themselves to any company.
create or replace function guard_customer_privileged_fields() returns trigger as $$
begin
  if not is_admin() then
    if tg_op = 'UPDATE' then
      if new.approval_status is distinct from old.approval_status
         or new.price_tier is distinct from old.price_tier
         or new.bank_transfer_enabled is distinct from old.bank_transfer_enabled
         or new.cash_enabled is distinct from old.cash_enabled
         or new.failed_login_attempts is distinct from old.failed_login_attempts
         or new.login_locked_at is distinct from old.login_locked_at
         or new.parent_customer_id is distinct from old.parent_customer_id then
        raise exception 'only an admin can change approval_status, price_tier, bank_transfer_enabled, cash_enabled, failed_login_attempts, login_locked_at, or parent_customer_id';
      end if;
    elsif tg_op = 'INSERT' then
      new.approval_status := 'pending';
      new.price_tier := 'no_price';
      new.bank_transfer_enabled := false;
      new.cash_enabled := false;
      new.failed_login_attempts := 0;
      new.login_locked_at := null;
      new.parent_customer_id := null;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;
