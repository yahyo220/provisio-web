// Provisio / Freshline — sign-in with a failed-attempt lockout.
//
// The app used to call resolve_login_email() then auth.signInWithPassword()
// directly from the client — nothing ever counted failures, so
// resolve_login_email (0018) could be probed indefinitely to find out which
// logins exist. This function wraps the same two steps but reports the
// result to record_login_result() (0044) so 3 wrong passwords locks the
// account until an admin unlocks it on the website.
//
// Deploy with:
//   supabase functions deploy login

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    const login = (body.login as string | undefined)?.trim()
    const password = body.password as string | undefined
    if (!login || !password) return json({ error: 'login and password are required' }, 400)

    const db = createClient(SUPABASE_URL, ANON_KEY)

    const { data: locked } = await db.rpc('check_login_lock', { p_login: login })
    if (locked) {
      return json({ error: 'Аккаунт заблокирован после нескольких неверных попыток входа. Обратитесь в поддержку.' }, 423)
    }

    const { data: email, error: resolveErr } = await db.rpc('resolve_login_email', { p_login: login })
    if (resolveErr || !email) return json({ error: 'Неверный логин или пароль' }, 401)

    const { data: signInData, error: signInError } = await db.auth.signInWithPassword({
      email: email as string,
      password,
    })

    // Best-effort — a hiccup here must never leave the customer permanently
    // unable to log in just because this bookkeeping call failed.
    try {
      await db.rpc('record_login_result', { p_login: login, p_success: !signInError })
    } catch (_) {
      // ignore
    }

    if (signInError || !signInData.session) {
      return json({ error: 'Неверный логин или пароль' }, 401)
    }

    return json({
      access_token: signInData.session.access_token,
      refresh_token: signInData.session.refresh_token,
    })
  } catch (err) {
    return json({ error: (err as Error).message ?? 'Unexpected error' }, 500)
  }
})
