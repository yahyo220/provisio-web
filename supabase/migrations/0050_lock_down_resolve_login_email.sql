-- Provisio / Freshline — close the email-enumeration hole resolve_login_email
-- (0018) still had on its own, separate from the 3-attempt lockout (0044).
--
-- resolve_login_email(p_login) was grant execute to anon so the login flow
-- could look an email up *before* having a session — but that grant let
-- anyone call it directly (not through the login edge function) and tell,
-- from the response alone, whether a login/email exists: a match returns
-- the account's real email, no match echoes the input back unchanged. Going
-- through the actual login edge function never leaked this (a bad password
-- and a nonexistent login both come back as the same generic "Неверный
-- логин или пароль"), and the app already exclusively signs in through that
-- function (see "Security: route sign-in through the login Edge Function") —
-- nothing legitimate ever called this RPC directly. Same treatment as
-- check_login_lock/record_login_result in 0048: service_role-only now, the
-- edge function's existing service-role client makes the call instead.
revoke execute on function public.resolve_login_email(text) from anon, authenticated;
grant execute on function public.resolve_login_email(text) to service_role;
