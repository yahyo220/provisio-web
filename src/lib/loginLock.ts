// Keep in sync with migration 0060 (check_login_lock / record_login_result)
// and the message in supabase/functions/login.
export const LOGIN_LOCK_MINUTES = 15

/** Whether a login is locked right now. Since 0060 a lock expires by itself
 * after LOGIN_LOCK_MINUTES, but login_locked_at stays set until the next
 * sign-in attempt — so an old timestamp alone doesn't mean "locked". */
export function isLoginLocked(loginLockedAt: string | null): boolean {
  if (!loginLockedAt) return false
  return Date.now() - new Date(loginLockedAt).getTime() < LOGIN_LOCK_MINUTES * 60_000
}
