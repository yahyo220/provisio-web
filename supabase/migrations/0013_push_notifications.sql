-- Freshline — push notifications: adds the column each device's Firebase
-- Cloud Messaging token is stored in (the app upserts this once signed in —
-- see lib/services/push_service.dart), and a helper the send-push Edge
-- Function uses to look up "who does this order belong to" without going
-- through RLS (it runs with the service-role key already, but this keeps
-- the function's own SQL simple and consistent with the rest of the schema).
--
-- Existing "customer update own" / "driver update own" policies from
-- 0002_roles_auth.sql already cover writing this column — no new RLS needed.

alter table customers add column if not exists fcm_token text;
alter table drivers add column if not exists fcm_token text;

comment on column customers.fcm_token is 'Firebase Cloud Messaging token for this shopper''s current device, set by the app on sign-in.';
comment on column drivers.fcm_token is 'Firebase Cloud Messaging token for this courier''s current device, set by the app on sign-in.';
