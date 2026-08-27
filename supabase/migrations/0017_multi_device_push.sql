-- Freshline — support more than one signed-in device per account getting
-- push notifications (e.g. a restaurant where the bar and the kitchen each
-- order from the same login) — a single fcm_token column meant only the
-- most-recently-signed-in device ever got notified.

alter table customers add column if not exists fcm_tokens text[] not null default '{}';
alter table drivers add column if not exists fcm_tokens text[] not null default '{}';

update customers set fcm_tokens = array[fcm_token] where fcm_token is not null and fcm_token <> '';
update drivers set fcm_tokens = array[fcm_token] where fcm_token is not null and fcm_token <> '';

alter table customers drop column if exists fcm_token;
alter table drivers drop column if exists fcm_token;

-- Adds/removes this device's token on whichever row belongs to the caller
-- (scoped by auth.uid(), never trusted from the client) — security definer
-- so the array dedupe/removal is one atomic statement instead of a
-- client-side read-modify-write that would lose updates when two devices
-- register at the same moment.
create or replace function public.push_token_add(p_token text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update customers set fcm_tokens = array(select distinct unnest(fcm_tokens || array[p_token])) where auth_user_id = auth.uid();
  update drivers set fcm_tokens = array(select distinct unnest(fcm_tokens || array[p_token])) where auth_user_id = auth.uid();
end;
$$;

create or replace function public.push_token_remove(p_token text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update customers set fcm_tokens = array_remove(fcm_tokens, p_token) where auth_user_id = auth.uid();
  update drivers set fcm_tokens = array_remove(fcm_tokens, p_token) where auth_user_id = auth.uid();
end;
$$;

grant execute on function public.push_token_add(text) to authenticated;
grant execute on function public.push_token_remove(text) to authenticated;
