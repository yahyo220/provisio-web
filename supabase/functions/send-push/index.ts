// Freshline — send-push edge function.
//
// Turns a Database Webhook event into a Firebase Cloud Messaging push, sent
// to the right customer or courier's device (see customers.fcm_token /
// drivers.fcm_token, added in migration 0013). Wire this up in the Supabase
// dashboard under Database → Webhooks, one webhook per row below, each
// pointing at this function:
//
//   table            event   condition (optional, else fires on every row)
//   orders           UPDATE  —  (this function only pushes when status actually changed)
//   customers        UPDATE  —  (this function only pushes on pending/suspended → approved)
//   support_messages INSERT  —  (only pushes for sender = 'admin')
//   deliveries       UPDATE  —  (only pushes when driver_id is newly assigned)
//
// Deploy with:
//   supabase functions deploy send-push
// Then set the three secrets from your Firebase service account JSON
// (Firebase console → Project settings → Service accounts → Generate new
// private key):
//   supabase secrets set FCM_PROJECT_ID=your-firebase-project-id
//   supabase secrets set FCM_CLIENT_EMAIL=firebase-adminsdk-...@your-project.iam.gserviceaccount.com
//   supabase secrets set FCM_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided automatically.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FCM_PROJECT_ID = Deno.env.get('FCM_PROJECT_ID')!
const FCM_CLIENT_EMAIL = Deno.env.get('FCM_CLIENT_EMAIL')!
const FCM_PRIVATE_KEY = (Deno.env.get('FCM_PRIVATE_KEY') ?? '').replace(/\\n/g, '\n')
// Deployed with --no-verify-jwt (Database Webhooks don't send a caller JWT
// this function can validate the usual way), so this shared secret is the
// only thing stopping a stranger who finds this function's URL from
// triggering arbitrary pushes. Set it with:
//   supabase secrets set WEBHOOK_SECRET=<some long random string>
// then add a custom header in each Database Webhook (below): the same
// name/value, e.g. x-webhook-secret: <that string>.
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET')

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const ORDER_STATUS_LABEL: Record<string, string> = {
  confirmed: 'Заказ подтверждён',
  preparing: 'Заказ собирается',
  ready: 'Заказ готов к отправке',
  out: 'Курьер выехал с заказом',
  delivered: 'Заказ доставлен',
  cancelled: 'Заказ отменён',
}

// ---------------------------------------------------------------------------
// Google OAuth2 (service-account JWT bearer flow) — no external lib needed,
// just Web Crypto. Gets a short-lived access token scoped to FCM.
// ---------------------------------------------------------------------------

function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let str = ''
  for (const b of arr) str += String.fromCharCode(b)
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '')
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0))
  return crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
}

let cachedToken: { value: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.value

  const now = Math.floor(Date.now() / 1000)
  const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })))
  const claims = base64url(
    new TextEncoder().encode(
      JSON.stringify({
        iss: FCM_CLIENT_EMAIL,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
      }),
    ),
  )
  const signingInput = `${header}.${claims}`
  const key = await importPrivateKey(FCM_PRIVATE_KEY)
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput))
  const jwt = `${signingInput}.${base64url(signature)}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`OAuth token exchange failed: ${JSON.stringify(data)}`)

  cachedToken = { value: data.access_token, expiresAt: now * 1000 + data.expires_in * 1000 }
  return cachedToken.value
}

async function sendPush(token: string, title: string, body: string, data: Record<string, string> = {}) {
  const accessToken = await getAccessToken()
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${FCM_PROJECT_ID}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { token, notification: { title, body }, data } }),
  })
  if (!res.ok) {
    const detail = await res.text()
    // An invalid/expired token is expected background noise (uninstalled
    // app, reinstalled device) — don't fail the whole webhook over it.
    console.error('FCM send failed', res.status, detail)
  }
}

// fcm_tokens is an array — more than one device (e.g. a restaurant's bar
// and kitchen phones) can be signed into the same account at once, and all
// of them should hear about it.
async function sendPushToAll(tokens: unknown, title: string, body: string, data: Record<string, string> = {}) {
  if (!Array.isArray(tokens)) return
  await Promise.all(tokens.filter((t): t is string => typeof t === 'string' && t.length > 0).map((t) => sendPush(t, title, body, data)))
}

// ---------------------------------------------------------------------------
// Webhook payload → notification
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  try {
    if (WEBHOOK_SECRET && req.headers.get('x-webhook-secret') !== WEBHOOK_SECRET) {
      return json({ error: 'Unauthorized' }, 401)
    }

    const payload = await req.json()
    const { type, table, record, old_record } = payload as {
      type: 'INSERT' | 'UPDATE' | 'DELETE'
      table: string
      record: Record<string, unknown>
      old_record: Record<string, unknown> | null
    }

    if (table === 'orders' && type === 'UPDATE') {
      const newStatus = record.status as string
      const oldStatus = old_record?.status as string | undefined
      if (newStatus && newStatus !== oldStatus && ORDER_STATUS_LABEL[newStatus]) {
        const { data: customer } = await admin
          .from('customers')
          .select('fcm_tokens')
          .eq('id', record.customer_id as string)
          .maybeSingle()
        await sendPushToAll(customer?.fcm_tokens, ORDER_STATUS_LABEL[newStatus], `Заказ №${record.order_number ?? ''}`.trim(), {
          type: 'order_status',
          orderId: String(record.id ?? ''),
        })
      }
    } else if (table === 'customers' && type === 'UPDATE') {
      const becameApproved = old_record?.approval_status !== 'approved' && record.approval_status === 'approved'
      if (becameApproved) {
        await sendPushToAll(record.fcm_tokens, 'Аккаунт подтверждён', 'Теперь вы можете оформлять заказы в Freshline.', {
          type: 'account_approved',
        })
      }
    } else if (table === 'support_messages' && type === 'INSERT') {
      if (record.sender === 'admin') {
        const { data: customer } = await admin
          .from('customers')
          .select('fcm_tokens')
          .eq('id', record.customer_id as string)
          .maybeSingle()
        const text = String(record.message ?? '')
        await sendPushToAll(
          customer?.fcm_tokens,
          'Новое сообщение от поддержки',
          text.length > 120 ? `${text.slice(0, 117)}...` : text,
          { type: 'support_message' },
        )
      }
    } else if (table === 'deliveries' && (type === 'UPDATE' || type === 'INSERT')) {
      const driverId = record.driver_id as string | undefined
      const driverChanged = driverId && driverId !== (old_record?.driver_id as string | undefined)
      if (driverChanged) {
        const { data: driver } = await admin.from('drivers').select('fcm_tokens').eq('id', driverId).maybeSingle()
        await sendPushToAll(driver?.fcm_tokens, 'Новая доставка', record.address ? String(record.address) : 'Вам назначена доставка.', {
          type: 'delivery_assigned',
          deliveryId: String(record.id ?? ''),
        })
      }
    }

    return json({ ok: true })
  } catch (err) {
    console.error(err)
    return json({ error: (err as Error).message ?? 'Unexpected error' }, 500)
  }
})
