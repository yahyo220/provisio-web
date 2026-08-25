// Provisio — create-account edge function.
//
// Creates a real login (email + password) for a courier or a customer, on
// the admin's behalf. This has to run server-side because it needs the
// service_role key, which must never reach the browser — the website calls
// this function instead of talking to Supabase Auth's admin API directly.
//
// Deploy with:
//   supabase functions deploy create-account
// The SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY secrets are provided
// automatically by the Supabase platform for edge functions — no need to
// set them by hand.

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

    // Verify the caller is a signed-in user, using their own token (anon key + user JWT).
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: callerData, error: callerErr } = await callerClient.auth.getUser(callerToken)
    if (callerErr || !callerData?.user) return json({ error: 'Invalid session' }, 401)

    // Service-role client for everything privileged from here on.
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    const { data: adminRow } = await admin
      .from('admin_users')
      .select('auth_user_id')
      .eq('auth_user_id', callerData.user.id)
      .maybeSingle()
    if (!adminRow) return json({ error: 'Only an admin can create accounts' }, 403)

    const body = await req.json()
    const role = body.role as 'courier' | 'customer'
    const email = (body.email as string | undefined)?.trim()
    const password = body.password as string | undefined
    const name = (body.name as string | undefined)?.trim() ?? ''
    const phone = (body.phone as string | undefined)?.trim() ?? ''

    if (!role || !['courier', 'customer'].includes(role)) return json({ error: 'role must be "courier" or "customer"' }, 400)
    if (!email || !password) return json({ error: 'email and password are required' }, 400)
    if (password.length < 6) return json({ error: 'password must be at least 6 characters' }, 400)

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role, name },
    })
    if (createErr || !created?.user) return json({ error: createErr?.message ?? 'Failed to create user' }, 400)

    const authUserId = created.user.id

    if (role === 'courier') {
      const { data: driver, error: driverErr } = await admin
        .from('drivers')
        .insert({ name: name || email, phone, auth_user_id: authUserId, active: true })
        .select()
        .single()
      if (driverErr) {
        await admin.auth.admin.deleteUser(authUserId)
        return json({ error: driverErr.message }, 400)
      }
      return json({ ok: true, authUserId, driver })
    } else {
      const priceTier = (body.priceTier as string | undefined) ?? 'no_price'
      const { data: customer, error: custErr } = await admin
        .from('customers')
        .insert({
          name: name || email,
          type: (body.type as string | undefined) ?? 'Retail',
          phone,
          email,
          location: (body.location as string | undefined) ?? '',
          auth_user_id: authUserId,
          approval_status: 'approved',
          price_tier: priceTier,
        })
        .select()
        .single()
      if (custErr) {
        await admin.auth.admin.deleteUser(authUserId)
        return json({ error: custErr.message }, 400)
      }
      return json({ ok: true, authUserId, customer })
    }
  } catch (err) {
    return json({ error: (err as Error).message ?? 'Unexpected error' }, 500)
  }
})
