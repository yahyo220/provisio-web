-- Freshline — requests ("заявки") left on the public landing page
-- (freshline-site.vercel.app). The page is open to anyone, so anon may only
-- INSERT a new row; reading, updating and deleting are admin-only. There is
-- no anon SELECT policy at all, so the site posts with Prefer: return=minimal.
--
-- Length checks keep a bot from stuffing huge payloads; status can only start
-- as 'new' from the site, an admin flips it to 'done' from the Provisio
-- "Заявки" page.
create table if not exists public.site_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  phone text not null check (char_length(btrim(phone)) between 5 and 30),
  business_type text check (business_type is null or char_length(business_type) <= 60),
  comment text check (comment is null or char_length(comment) <= 1000),
  lang text check (lang is null or lang in ('ru', 'uz')),
  status text not null default 'new' check (status in ('new', 'done'))
);

create index if not exists site_leads_created_at_idx on public.site_leads (created_at desc);

alter table public.site_leads enable row level security;

drop policy if exists "anyone submits a site lead" on public.site_leads;
create policy "anyone submits a site lead" on public.site_leads for insert
  to anon, authenticated
  with check (status = 'new');

drop policy if exists "admin manages site leads" on public.site_leads;
create policy "admin manages site leads" on public.site_leads for all
  using (is_admin())
  with check (is_admin());

-- Name anon explicitly (0053: anon can hold grants that don't come from PUBLIC).
revoke all on public.site_leads from public, anon, authenticated;
grant insert on public.site_leads to anon, authenticated;
grant select, update, delete on public.site_leads to authenticated;

-- Live updates on the admin page.
alter publication supabase_realtime add table public.site_leads;
