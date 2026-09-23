-- Provisio / Freshline — parent_customer_id (0047) was documented as
-- "single level" (a staff login links to one top-level client, never a
-- chain), but nothing actually enforced that beyond the self-reference
-- check — only the website's own `linkable` filter in CustomerDetail.tsx
-- kept an admin from picking a bad target. Low risk since only an admin
-- can write this column at all (guard_customer_privileged_fields), but
-- worth closing at the DB level too rather than relying solely on one
-- page's client-side filter.
create or replace function enforce_single_level_staff_link() returns trigger as $$
begin
  if new.parent_customer_id is not null then
    if exists (select 1 from customers where id = new.parent_customer_id and parent_customer_id is not null) then
      raise exception 'parent_customer_id must point to a top-level client, not one that is itself linked to another';
    end if;
    if exists (select 1 from customers where parent_customer_id = new.id) then
      raise exception 'a client that already has its own linked staff cannot itself be linked to another client';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists customers_enforce_single_level_staff_link on customers;
create trigger customers_enforce_single_level_staff_link
  before insert or update of parent_customer_id on customers
  for each row execute function enforce_single_level_staff_link();
