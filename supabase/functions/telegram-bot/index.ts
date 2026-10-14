// Freshline — telegram-bot edge function: orders from clients' Telegram groups.
//
// Every message in a group linked to a client (telegram_chats, migration
// 0063) is read as a possible order: lines with a product and a quantity
// ("Помидор красный 10 кг", "Qizil pamidor 3kg") become an order through
// telegram_place_order(), which shows up on the dashboard like any other.
// Plain chat ("спасибо", questions) matches nothing and is left alone.
//
// Commands (in the group):
//   /id               — this chat's id and your Telegram user id
//   /link <login>     — admins only: this group orders for that client
//   /unlink           — admins only
//   /help
//
// Deploy with --no-verify-jwt (Telegram can't send a Supabase JWT) and set:
//   supabase secrets set TELEGRAM_BOT_TOKEN=<from @BotFather>
//   supabase secrets set TELEGRAM_WEBHOOK_SECRET=<long random string>
//   supabase secrets set TELEGRAM_ADMIN_IDS=<your Telegram user id, comma-separated>
// then open <function url>?setup=1 once to register the webhook. The bot
// needs privacy mode off (@BotFather → /setprivacy → Disable) or admin rights
// in the group to see ordinary messages.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { parseOrderText, prepareCatalog, type CatalogProduct } from './parse.ts'
import { money, orderPdf, summaryPdf, type SummaryRow } from './pdf.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')
const WEBHOOK_SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET')
// The one person who gets, every night at 03:00, the накладная of each order
// placed since 17:00 and the "Товары по заказам" for them.
const DOCS_CHAT_ID = Deno.env.get('TELEGRAM_DOCS_CHAT_ID')
// Shared with send-push: the database's own calls (new app order, daily
// summary from pg_cron) carry it as x-webhook-secret — see migration 0064.
const DB_SECRET = Deno.env.get('WEBHOOK_SECRET')
const ADMIN_IDS = new Set((Deno.env.get('TELEGRAM_ADMIN_IDS') ?? '').split(',').map((s) => s.trim()).filter(Boolean))

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const HELP = [
  'Я принимаю заказы из этой группы. Пишите списком, каждую позицию с новой строки:',
  '',
  'Помидор красный 10 кг',
  'Айсберг 5 шт',
  'Петрушка 2 пучка',
  '',
  'Можно по-русски или по-узбекски. Если допишете что-то в течение часа, это добавится в тот же заказ.',
].join('\n')

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

async function telegram(method: string, payload: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) console.error('telegram', method, res.status, JSON.stringify(data))
  return data
}

function reply(chatId: number, messageId: number, text: string) {
  return telegram('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', reply_to_message_id: messageId, allow_sending_without_reply: true })
}

const UNIT_RU: Record<string, string> = { kg: 'кг', piece: 'шт.', box: 'коробка', bottle: 'бутылка', package: 'упаковка', bunch: 'пучок', bag: 'мешок', pack: 'уп.', gram: 'грамм' }
const PAYMENT_RU: Record<string, string> = { cash: 'Наличные', transfer: 'Перечисление', card: 'Карта' }

async function sendPdf(chatId: string, bytes: Uint8Array, filename: string, caption: string) {
  const form = new FormData()
  form.append('chat_id', chatId)
  form.append('caption', caption)
  form.append('document', new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }), filename)
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, { method: 'POST', body: form })
  if (!res.ok) console.error('sendDocument', res.status, await res.text())
}

/** The order's накладная as a PDF, to the documents recipient. */
async function sendOrderDocument(orderId: string) {
  if (!DOCS_CHAT_ID) return console.error('TELEGRAM_DOCS_CHAT_ID not set — no document sent')
  const { data: o } = await admin
    .from('orders')
    .select('id, order_number, company_order_number, created_at, delivery_address, delivery_slot, delivery_fee, payment_method, source, customer_id, company_id, order_items(name, qty, unit, unit_price, products(name, category))')
    .eq('id', orderId)
    .maybeSingle()
  if (!o) return
  const ids = [o.customer_id, o.company_id].filter(Boolean)
  const { data: people } = await admin.from('customers').select('id, name, company_name, staff_role, contact, phone').in('id', ids)
  const person = people?.find((c) => c.id === o.customer_id)
  const company = people?.find((c) => c.id === (o.company_id ?? o.customer_id))
  const companyName = company?.company_name || company?.name || 'Клиент'
  const number = o.company_order_number ?? o.order_number
  // deno-lint-ignore no-explicit-any
  const lines = (o.order_items as any[]).map((i) => ({
    name: i.products?.name ?? i.name,
    category: i.products?.category ?? null,
    qty: Number(i.qty),
    unit: UNIT_RU[i.unit] ?? i.unit,
    price: Number(i.unit_price),
  }))
  const pdf = await orderPdf({
    number,
    company: companyName,
    placedBy: [person?.name, person?.staff_role].filter(Boolean).join(', '),
    contact: [person?.contact && person.contact !== '—' ? person.contact : '', person?.phone].filter(Boolean).join(', '),
    createdAt: o.created_at,
    deliveryFee: Number(o.delivery_fee ?? 0),
    address: o.delivery_address ?? '',
    slot: o.delivery_slot ?? '',
    payment: PAYMENT_RU[o.payment_method ?? ''] ?? '',
    lines,
  })
  const total = lines.reduce((s, l) => s + l.qty * l.price, 0)
  const via = o.source === 'telegram' ? 'Telegram' : 'приложение'
  await sendPdf(DOCS_CHAT_ID, pdf, `Заказ ${companyName} №${number}.pdf`, `Заказ ${companyName} №${number} (${via}) — ${lines.length} поз., ${money(total)} без НДС`)
}

/** 03:00 Tashkent: each order placed since 17:00 the evening before — its
 * накладная, then "Товары по заказам" for all of them added up. */
async function sendNightBatch() {
  if (!DOCS_CHAT_ID) return console.error('TELEGRAM_DOCS_CHAT_ID not set — nothing sent')
  // Tashkent is UTC+5 all year: 03:00 there is 22:00 UTC, 17:00 is 12:00 UTC.
  const end = new Date()
  end.setUTCMinutes(0, 0, 0)
  if (end.getUTCHours() < 22) end.setUTCDate(end.getUTCDate() - 1)
  end.setUTCHours(22)
  const start = new Date(end.getTime() - 10 * 3600 * 1000)
  const fmt = (d: Date) => d.toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  const period = `${fmt(start)} – ${fmt(end)}`

  const { data: orders } = await admin
    .from('orders')
    .select('id, order_number, company_order_number, company_id, customer_id, order_items(product_id, name, qty, unit, products(name, category, unit, price, unit_prices))')
    .neq('status', 'cancelled')
    .gte('created_at', start.toISOString())
    .lt('created_at', end.toISOString())
    .order('created_at')
  if (!orders?.length) {
    await telegram('sendMessage', { chat_id: DOCS_CHAT_ID, text: `Заказов с ${period} не было.` })
    return
  }
  for (const o of orders) await sendOrderDocument(o.id).catch((err) => console.error('order document', o.id, err))
  const rows = new Map<string, SummaryRow>()
  for (const o of orders) {
    // deno-lint-ignore no-explicit-any
    for (const i of o.order_items as any[]) {
      const unit = UNIT_RU[i.unit] ?? i.unit
      const key = `${i.product_id ?? i.name}|${unit}`
      const p = i.products
      const sameUnit = p && ((UNIT_RU[p.unit] ?? p.unit) === unit || !(p.unit_prices?.length))
      const price = !p ? null : sameUnit ? Number(p.price) : Number(p.unit_prices.find((u: { unit: string }) => (UNIT_RU[u.unit] ?? u.unit) === unit)?.price ?? NaN)
      const row = rows.get(key) ?? { name: p?.name ?? i.name, category: p?.category ?? null, unit, total: 0, price: Number.isFinite(price) ? price : null }
      row.total += Number(i.qty)
      rows.set(key, row)
    }
  }
  const ids = [...new Set(orders.map((o) => o.company_id ?? o.customer_id).filter(Boolean))]
  const { data: companies } = await admin.from('customers').select('id, name, company_name').in('id', ids)
  const nameOf = new Map((companies ?? []).map((c) => [c.id, c.company_name || c.name]))
  const list = orders.map((o) => `${nameOf.get(o.company_id ?? o.customer_id) ?? 'Клиент'} №${o.company_order_number ?? o.order_number}`).join(', ')
  const day = end.toLocaleDateString('ru-RU', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', year: 'numeric' })
  const pdf = await summaryPdf('Товары по заказам — нужно списать', `${period} · заказов: ${orders.length} (${list})`, [...rows.values()])
  await sendPdf(DOCS_CHAT_ID, pdf, `Товары по заказам ${day}.pdf`, `Товары по заказам, ${period}: ${rows.size} поз. из ${orders.length} заказов`)
}

function formatQty(n: number) {
  return String(Math.round(n * 1000) / 1000).replace('.', ',')
}

interface TgMessage {
  message_id: number
  text?: string
  chat: { id: number; title?: string; type: string }
  from?: { id: number; is_bot?: boolean }
}

async function handleCommand(msg: TgMessage, text: string) {
  const [rawCmd, ...args] = text.trim().split(/\s+/)
  // "/id." or "/link@freshline_bot" → "/id", "/link".
  const cmd = rawCmd.split('@')[0].toLowerCase().replace(/[^a-z/]/g, '')
  const isAdmin = msg.from && ADMIN_IDS.has(String(msg.from.id))

  if (cmd === '/id') {
    return reply(msg.chat.id, msg.message_id, `ID этого чата: <code>${msg.chat.id}</code>\nВаш ID в Telegram: <code>${msg.from?.id ?? '—'}</code>`)
  }
  if (cmd === '/start' || cmd === '/help') {
    return reply(msg.chat.id, msg.message_id, esc(HELP))
  }
  if (cmd === '/link' || cmd === '/unlink') {
    if (!isAdmin) return reply(msg.chat.id, msg.message_id, 'Эта команда только для администратора Freshline.')
    if (cmd === '/unlink') {
      await admin.from('telegram_chats').delete().eq('chat_id', msg.chat.id)
      return reply(msg.chat.id, msg.message_id, 'Группа отвязана. Заказы отсюда больше не принимаются.')
    }
    const login = args.join(' ').trim()
    if (!login) return reply(msg.chat.id, msg.message_id, 'Напишите логин клиента: /link логин')
    // Exact login first (case-insensitive), then the client's name.
    const pattern = login.replace(/[\\%_]/g, '\\$&')
    let { data: customer } = await admin.from('customers').select('id, name').ilike('login', pattern).limit(2)
    if (!customer?.length) ({ data: customer } = await admin.from('customers').select('id, name').ilike('name', pattern).limit(2))
    if (!customer || customer.length !== 1) {
      return reply(msg.chat.id, msg.message_id, `Не нашёл клиента «${esc(login)}». Нужен логин из приложения (как на сайте в карточке клиента).`)
    }
    const { error } = await admin.from('telegram_chats').upsert({ chat_id: msg.chat.id, customer_id: customer[0].id, title: msg.chat.title ?? null })
    if (error) {
      console.error(error)
      return reply(msg.chat.id, msg.message_id, 'Не получилось привязать группу, попробуйте ещё раз.')
    }
    return reply(msg.chat.id, msg.message_id, `Готово: заказы из этой группы будут оформляться на «${esc(customer[0].name)}».\n\n${esc(HELP)}`)
  }
}

async function handleOrder(msg: TgMessage, text: string) {
  const { data: products, error } = await admin
    .from('products')
    .select('id, name, name_uz_cyrl, name_uz_latn, name_en, unit, sku')
    .eq('active', true)
    .order('sku')
  if (error || !products) {
    console.error(error)
    return
  }
  const lines = parseOrderText(text, prepareCatalog(products as CatalogProduct[]))
  const ok = lines.filter((l) => l.product && l.qty)
  if (ok.length === 0) return // ordinary chat

  const { data: link } = await admin.from('telegram_chats').select('customer_id').eq('chat_id', msg.chat.id).maybeSingle()
  if (!link) {
    if (ok.length >= 2) {
      await reply(msg.chat.id, msg.message_id, 'Эта группа ещё не привязана к клиенту, поэтому заказ не оформлен. Администратор, отправьте: /link логин_клиента')
    }
    return
  }

  const unknown = lines.filter((l) => !l.product && l.qty)
  const noQty = lines.filter((l) => l.product && !l.qty)
  const notes = [
    unknown.length ? `Telegram, не распознано: ${unknown.map((l) => l.text).join('; ')}` : '',
    noQty.length ? `Telegram, без количества: ${noQty.map((l) => l.text).join('; ')}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const { data: placed, error: placeError } = await admin.rpc('telegram_place_order', {
    p_chat_id: msg.chat.id,
    p_items: ok.map((l) => ({ product_id: l.product!.id, qty: l.qty, unit: l.unit })),
    p_notes: notes,
  })
  if (placeError || !placed) {
    console.error(placeError)
    const why = /payment is not enabled|not enabled/.test(placeError?.message ?? '')
      ? 'у клиента не включён способ оплаты'
      : 'ошибка на сервере'
    return reply(msg.chat.id, msg.message_id, `Не удалось оформить заказ (${why}). Мы уже видим это и свяжемся с вами.`)
  }

  const head = placed.merged ? `➕ Добавлено в заказ №${placed.number}:` : `✅ Заказ №${placed.number} принят:`
  const body = ok.map((l) => `• ${esc(l.product!.name.trim())} — ${formatQty(l.qty!)} ${esc(l.unit)}`).join('\n')
  const extra = [
    unknown.length ? `\n⚠️ Не понял, уточните, пожалуйста:\n${unknown.map((l) => `• ${esc(l.text)}`).join('\n')}` : '',
    noQty.length ? `\n❓ Не указано количество:\n${noQty.map((l) => `• ${esc(l.text)}`).join('\n')}` : '',
  ].join('')
  await reply(msg.chat.id, msg.message_id, `${head}\n${body}${extra}`)
}

Deno.serve(async (req) => {
  try {
    if (!BOT_TOKEN || !WEBHOOK_SECRET) {
      console.error('TELEGRAM_BOT_TOKEN / TELEGRAM_WEBHOOK_SECRET not set')
      return json({ error: 'Not configured' }, 500)
    }

    // One-time setup: point Telegram at this function. Harmless to repeat —
    // it can only ever register this same URL with this same secret.
    const url = new URL(req.url)
    if (req.method === 'GET' && url.searchParams.has('setup')) {
      const result = await telegram('setWebhook', {
        url: `${SUPABASE_URL}/functions/v1/telegram-bot`,
        secret_token: WEBHOOK_SECRET,
        allowed_updates: ['message'],
      })
      return json(result)
    }

    // Calls from the database itself (migration 0064): a new order placed in
    // the app, and the daily summary from pg_cron.
    const dbSecret = req.headers.get('x-webhook-secret')
    if (dbSecret) {
      if (!DB_SECRET || dbSecret !== DB_SECRET) return json({ error: 'Unauthorized' }, 401)
      const body = await req.json()
      if (body.kind === 'daily') await sendNightBatch()
      return json({ ok: true })
    }

    if (req.headers.get('x-telegram-bot-api-secret-token') !== WEBHOOK_SECRET) {
      return json({ error: 'Unauthorized' }, 401)
    }

    const update = await req.json()
    const msg: TgMessage | undefined = update.message
    const text = msg?.text?.trim()
    if (!msg || !text || msg.from?.is_bot) return json({ ok: true })

    if (text.startsWith('/')) await handleCommand(msg, text)
    else await handleOrder(msg, text)
    return json({ ok: true })
  } catch (err) {
    console.error(err)
    // 200 so Telegram doesn't keep re-sending the same message.
    return json({ ok: false })
  }
})
