-- Provisio — company name + staff role on customer registration.
--
-- Restaurants/cafes share one login across staff (bar, kitchen), so the
-- registration form now also asks for the business name and the
-- registering person's role — both just informational for the admin
-- (customer list / detail on the website), not used for access control.

alter table customers add column if not exists company_name text;
alter table customers add column if not exists staff_role text;
