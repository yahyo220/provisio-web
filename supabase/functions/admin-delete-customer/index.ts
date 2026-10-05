// Provisio — admin-delete-customer edge function.
//
// Lets an admin remove a client from the website's Customer page. Runs
// server-side because it needs the service_role key (Auth admin API + rows
// the browser can't touch under RLS). Same admin check as set-account-password:
// the caller's own token must belong to a row in admin_users.
//
// Two outcomes, decided by the data:
//  - the client has NO orders  -> the row and the login are removed outright
//  - the client has orders     -> everything personal is erased and the row is
//    anonymized (same as the in-app "Удалить аккаунт"), because orders,
//    invoices and unpaid balances still point at it.
// A company that still has linked staff (Повар/Бармен) is refused — delete the
// staff first, otherwise they'd silently become separate top-level clients.
//
// Deploy with:
//   supabase functions deploy admin-delete-customer

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

const DELETED_NAME = 'Удалённый аккаунт'

type Admin = ReturnType<typeof createClient>

// Public storage URLs look like .../storage/v1/object/public/<bucket>/<path>.
async function removeStorageUrls(admin: Admin, urls: (string | null | undefined)[]) {
  const byBucket = new Map<string, string[]>()
  for (const url of urls) {
    const match = url?.match(/\/storage\/v1\/object\/public\/([^/]+)\/([^?]+)/)
    if (!match) continue
    byBucket.set(match[1], [...(byBucket.get(match[1]) ?? []), decodeURIComponent(match[2])])
  }
  for (const [bucket, paths] of byBucket) {
    const { error } = await admin.storage.from(bucket).remove(paths)
    if (error) console.error('storage cleanup failed', bucket, error.message)
  }
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
    if (!adminRow) return json({ error: 'Only an admin can delete customers' }, 403)

    const body = await req.json().catch(() => ({}))
    const customerId = (body.customerId as string | undefined)?.trim()
    if (!customerId) return json({ error: 'customerId is required' }, 400)

    const { data: customer } = await admin
      .from('customers')
      .select('id, auth_user_id, avatar_url')
      .eq('id', customerId)
      .maybeSingle()
    if (!customer) return json({ error: 'Customer not found' }, 404)

    // A website admin login must never be removable from here.
    if (customer.auth_user_id) {
      const { data: isAdmin } = await admin
        .from('admin_users')
        .select('auth_user_id')
        .eq('auth_user_id', customer.auth_user_id)
        .maybeSingle()
      if (isAdmin) return json({ error: 'This is an admin account and cannot be deleted' }, 403)
    }

    const { count: staffCount } = await admin
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('parent_customer_id', customerId)
    if ((staffCount ?? 0) > 0) {
      return json({ error: 'Сначала удалите сотрудников этой компании (Повар/Бармен).' }, 409)
    }

    const { count: orderCount } = await admin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', customerId)

    const photos: (string | null | undefined)[] = [customer.avatar_url as string | null]
    const { data: messages } = await admin.from('support_messages').select('photo_urls').eq('customer_id', customerId)
    for (const m of messages ?? []) photos.push(...((m.photo_urls as string[] | null) ?? []))
    const { data: feedback } = await admin.from('order_feedback').select('photo_urls').eq('customer_id', customerId)
    for (const f of feedback ?? []) photos.push(...((f.photo_urls as string[] | null) ?? []))
    await removeStorageUrls(admin, photos)

    for (const table of ['support_messages', 'notifications', 'product_reviews', 'order_feedback']) {
      const { error } = await admin.from(table).delete().eq('customer_id', customerId)
      if (error) return json({ error: `${table}: ${error.message}` }, 500)
    }

    const hasOrders = (orderCount ?? 0) > 0
    if (hasOrders) {
      const { error: anonErr } = await admin
        .from('customers')
        .update({
          name: DELETED_NAME,
          contact: null,
          phone: null,
          email: null,
          login: null,
          location: null,
          company_name: null,
          avatar_url: null,
          fcm_tokens: [],
          auth_user_id: null,
          status: 'inactive',
        })
        .eq('id', customerId)
      if (anonErr) return json({ error: anonErr.message }, 500)
    } else {
      const { error: delRowErr } = await admin.from('customers').delete().eq('id', customerId)
      if (delRowErr) return json({ error: delRowErr.message }, 500)
    }

    if (customer.auth_user_id) {
      const { error: delErr } = await admin.auth.admin.deleteUser(customer.auth_user_id as string)
      if (delErr) return json({ error: `Профиль удалён, но вход удалить не удалось: ${delErr.message}` }, 500)
    }

    return json({ ok: true, mode: hasOrders ? 'anonymized' : 'deleted' })
  } catch (err) {
    return json({ error: (err as Error).message ?? 'Unexpected error' }, 500)
  }
})
