-- Freshline / Provisio — a company's Руководитель (the root customer, or any
-- staff explicitly given that position via Добавить сотрудника) should see
-- every order placed by their linked staff, with prices, inside the app's
-- own order history — not just their own. A plain Повар/Бармен should keep
-- seeing only their own orders (already true — they simply never had
-- visibility into anyone else's). These policies are purely additive SELECT
-- grants (Postgres OR's multiple permissive policies together), so nothing
-- existing changes for anyone who isn't a manager with linked staff.

-- A customer's own id if they're a root/company account, or their parent's
-- id if they're linked staff — "which company does this row belong to."
create or replace function company_root_id(p_customer_id uuid) returns uuid as $$
  select coalesce(parent_customer_id, id) from customers where id = p_customer_id;
$$ language sql security definer stable set search_path = public;

-- Root accounts (no parent — the normal case for every existing customer)
-- and anyone explicitly added as "Руководитель" both get company-wide
-- visibility, even if the latter is itself linked under a parent.
create or replace function is_company_manager(p_customer_id uuid) returns boolean as $$
  select parent_customer_id is null or staff_role = 'Руководитель'
  from customers where id = p_customer_id;
$$ language sql security definer stable set search_path = public;

create policy "manager select company orders" on orders for select
  using (
    is_company_manager(current_customer_id())
    and company_root_id(orders.customer_id) = company_root_id(current_customer_id())
  );

create policy "manager select company order items" on order_items for select
  using (
    exists (
      select 1 from orders o
      where o.id = order_items.order_id
        and is_company_manager(current_customer_id())
        and company_root_id(o.customer_id) = company_root_id(current_customer_id())
    )
  );

-- Needed so a manager's order-history query can embed the orderer's name
-- (customers(name)) for staff other than themselves — "customer select own"
-- only ever covered auth_user_id = auth.uid().
create policy "manager select company customers" on customers for select
  using (
    is_company_manager(current_customer_id())
    and company_root_id(customers.id) = company_root_id(current_customer_id())
  );
