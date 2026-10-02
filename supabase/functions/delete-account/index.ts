// Freshline — delete-account edge function.
//
// Lets a signed-in customer (or courier) delete their OWN account from inside
// the app (required by App Store guideline 5.1.1(v)). Needs the service-role
// key (Auth admin API + rows the caller can't touch under RLS), so it runs
// server-side. The caller proves who they are with their session token and
// re-enters their password as a confirmation.
//
// What happens: everything personal is deleted (support chat, notifications,
// reviews, feedback, photos, push tokens, login) and the profile row is
// anonymized. Orders stay, no longer tied to a name — deliveries, invoices
// and any unpaid balance still need them for accounting.
//
// Deploy with:
//   supabase functions deploy delete-account

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
    const user = callerData?.user
    if (callerErr || !user) return json({ error: 'Invalid session' }, 401)

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // A website admin login must never be removable from the app.
    const { data: adminRow } = await admin.from('admin_users').select('auth_user_id').eq('auth_user_id', user.id).maybeSingle()
    if (adminRow) return json({ error: 'admin_account' }, 403)

    // Confirmation: the account's own password, checked on a throwaway client
    // so it never touches the caller's session.
    const body = await req.json().catch(() => ({}))
    const password = body.password as string | undefined
    if (!password || !user.email) return json({ error: 'wrong_password' }, 400)
    const verifier = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    const { error: pwErr } = await verifier.auth.signInWithPassword({ email: user.email, password })
    if (pwErr) return json({ error: 'wrong_password' }, 400)

    const { data: customer } = await admin.from('customers').select('id, avatar_url').eq('auth_user_id', user.id).maybeSingle()
    const { data: driver } = customer
      ? { data: null }
      : await admin.from('drivers').select('id').eq('auth_user_id', user.id).maybeSingle()

    if (customer) {
      const id = customer.id as string
      const photos: (string | null | undefined)[] = [customer.avatar_url as string | null]

      const { data: messages } = await admin.from('support_messages').select('photo_urls').eq('customer_id', id)
      for (const m of messages ?? []) photos.push(...((m.photo_urls as string[] | null) ?? []))
      const { data: feedback } = await admin.from('order_feedback').select('photo_urls').eq('customer_id', id)
      for (const f of feedback ?? []) photos.push(...((f.photo_urls as string[] | null) ?? []))
      await removeStorageUrls(admin, photos)

      for (const table of ['support_messages', 'notifications', 'product_reviews', 'order_feedback']) {
        const { error } = await admin.from(table).delete().eq('customer_id', id)
        if (error) return json({ error: 'failed', detail: `${table}: ${error.message}` }, 500)
      }

      // Detach the login first so deleting the Auth user below can't touch
      // this row, then blank out everything personal. Orders keep pointing
      // at it.
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
        .eq('id', id)
      if (anonErr) return json({ error: 'failed', detail: anonErr.message }, 500)
    } else if (driver) {
      const id = driver.id as string
      const { data: messages } = await admin.from('support_messages').select('photo_urls').eq('driver_id', id)
      const photos: (string | null | undefined)[] = []
      for (const m of messages ?? []) photos.push(...((m.photo_urls as string[] | null) ?? []))
      await removeStorageUrls(admin, photos)

      for (const table of ['support_messages', 'notifications']) {
        const { error } = await admin.from(table).delete().eq('driver_id', id)
        if (error) return json({ error: 'failed', detail: `${table}: ${error.message}` }, 500)
      }
      const { error: anonErr } = await admin
        .from('drivers')
        .update({ name: DELETED_NAME, phone: '', login: null, active: false, fcm_tokens: [], auth_user_id: null })
        .eq('id', id)
      if (anonErr) return json({ error: 'failed', detail: anonErr.message }, 500)
    }
    // No profile row at all (e.g. a half-finished sign-up): nothing to
    // anonymize, only the login to remove.

    const { error: delErr } = await admin.auth.admin.deleteUser(user.id)
    if (delErr) return json({ error: 'failed', detail: delErr.message }, 500)

    return json({ ok: true })
  } catch (err) {
    return json({ error: 'failed', detail: (err as Error).message }, 500)
  }
})
