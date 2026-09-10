-- Provisio — restricts what a courier can change on their own `drivers`
-- row directly (the "driver update own" policy from 0002_roles_auth.sql
-- otherwise allows any column). The app's courier edit-profile screen only
-- ever lets a courier change their own login ("код") — everything else
-- shows "please contact support" instead of an editable field, and this
-- trigger is what actually enforces that server-side rather than just in
-- the UI.
--
-- `active` stays self-editable too (CourierService.setActive — the on-shift
-- toggle on the profile tab, unrelated to this feature), and so does
-- `fcm_tokens` (push_token_add/remove in 0017_multi_device_push.sql update
-- it directly via a plain UPDATE, which still runs through this trigger
-- even though those functions are security definer).
create or replace function guard_driver_privileged_fields() returns trigger as $$
begin
  if not is_admin() then
    if new.name is distinct from old.name
       or new.phone is distinct from old.phone
       or new.auth_user_id is distinct from old.auth_user_id then
      raise exception 'only an admin can change name, phone, or auth_user_id on a driver';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists guard_driver_privileged_fields on drivers;
create trigger guard_driver_privileged_fields before update on drivers
  for each row execute function guard_driver_privileged_fields();
