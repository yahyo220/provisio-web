// Provisio — set-account-password edge function.
//
// Lets an admin choose a new password for a customer's login (e.g. a Повар
// or Бармен who forgot theirs). Has to run server-side because it needs the
// service_role key, which must never reach the browser. Same admin check as
// create-account: the caller's own token must belong to a row in admin_users.
//
// Deploy with:
//   supabase functions deploy set-account-password

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const callerToken = authHeader.replace('Bearer ', '')
    if (!callerToken) return json({ error: 'Missing Authorization header' }, 401)

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: callerData, error: callerErr } = await callerClient.auth.getUser(callerToken)
    if (callerErr || !callerData?.user) return json({ error: 'Invalid session' }, 401)

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    const { data: adminRow } = await admin
      .from('admin_users')
      .select('auth_user_id')
      .eq('auth_user_id', callerData.user.id)
      .maybeSingle()
    if (!adminRow) return json({ error: 'Only an admin can change passwords' }, 403)

    const body = await req.json()
    const customerId = (body.customerId as string | undefined)?.trim()
    const password = body.password as string | undefined
    if (!customerId || !password) return json({ error: 'customerId and password are required' }, 400)
    if (password.length < 8) return json({ error: 'password must be at least 8 characters' }, 400)

    const { data: customer } = await admin
      .from('customers')
      .select('auth_user_id')
      .eq('id', customerId)
      .maybeSingle()
    if (!customer?.auth_user_id) return json({ error: 'This customer has no app login' }, 404)

    const { error: updateErr } = await admin.auth.admin.updateUserById(customer.auth_user_id, { password })
    if (updateErr) return json({ error: updateErr.message }, 400)

    return json({ ok: true })
  } catch (err) {
    return json({ error: (err as Error).message ?? 'Unexpected error' }, 500)
  }
})
