// Freshline — telegram-bot edge function: orders from clients' Telegram groups.
//
// Every message in a group linked to a client (telegram_chats, migration
// 0063) is read as a possible order: lines with a product and a quantity
// ("Помидор красный 10 кг", "Qizil pamidor 3kg") become an order through
// telegram_place_order(), which shows up on the dashboard like any other.
// Plain chat ("спасибо", questions) matches nothing and is left alone.
//
// Commands work only in a private chat with the bot, and only for its owner
// (TELEGRAM_ADMIN_IDS) and people the owner allowed (/admins); everyone else,
// and every group, gets no answer to a command. When the bot is added to a
// group, the admins get a private message with a button per client.
//   /groups  — linked groups: change the client or unlink
//   /docs    — who receives the nightly order documents
//   /admins  — owner only: who else may manage the bot
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
import { orderXlsx, summaryXlsx, type XlsxSummaryRow } from './xlsx.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')
const WEBHOOK_SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET')
// The one person who gets, every night at 03:00, the накладная of each order
// placed since 17:00 and the "Товары по заказам" for them.
// Set from Telegram with /docs (telegram_settings, migration 0068); the
// secret is only the fallback.
const DOCS_CHAT_ID_FALLBACK = Deno.env.get('TELEGRAM_DOCS_CHAT_ID')
async function docsChatId(): Promise<string | undefined> {
  const { data } = await admin.from('telegram_settings').select('value').eq('key', 'docs_chat_id').maybeSingle()
  return data?.value || DOCS_CHAT_ID_FALLBACK
}
// Shared with send-push: the database's own calls (new app order, daily
// summary from pg_cron) carry it as x-webhook-secret — see migration 0064.
const DB_SECRET = Deno.env.get('WEBHOOK_SECRET')
const ADMIN_IDS = new Set((Deno.env.get('TELEGRAM_ADMIN_IDS') ?? '').split(',').map((s) => s.trim()).filter(Boolean))

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const DOCS_HELP = '/docs — выбрать, кто получает документы заказов (человек должен один раз нажать Start в этом боте)'

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

async function sendFile(chatId: string, bytes: Uint8Array, filename: string, caption: string) {
  const form = new FormData()
  form.append('chat_id', chatId)
  form.append('caption', caption)
  form.append('document', new Blob([new Uint8Array(bytes)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename)
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, { method: 'POST', body: form })
  if (!res.ok) console.error('sendDocument', res.status, await res.text())
}

/** The order's накладная (the website's order Excel), to the documents recipient. */
async function sendOrderDocument(orderId: string) {
  const DOCS_CHAT_ID = await docsChatId()
  if (!DOCS_CHAT_ID) return console.error('TELEGRAM_DOCS_CHAT_ID not set — no document sent')
  const { data: o } = await admin
    .from('orders')
    .select('id, order_number, company_order_number, created_at, source, customer_id, company_id, order_items(name, qty, unit, products(name, category))')
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
  }))
  const file = await orderXlsx({
    number,
    company: companyName,
    createdAt: o.created_at,
    staffRole: person?.staff_role ?? '',
    contact: (person?.contact && person.contact !== '—' ? person.contact : '') || person?.name || '',
    phone: person?.phone ?? '',
    lines,
  })
  const via = o.source === 'telegram' ? 'Telegram' : 'приложение'
  await sendFile(DOCS_CHAT_ID, file, `Накладная ${companyName} №${number}.xlsx`, `Заказ ${companyName} №${number} (${via}) — ${lines.length} поз.`)
}

/** 03:00 Tashkent: each order placed since 17:00 the evening before — its
 * накладная, then "Товары по заказам" for all of them added up. */
async function sendNightBatch(soFar = false) {
  const DOCS_CHAT_ID = await docsChatId()
  if (!DOCS_CHAT_ID) return console.error('TELEGRAM_DOCS_CHAT_ID not set — nothing sent')
  // Tashkent is UTC+5 all year: 03:00 there is 22:00 UTC, 17:00 is 12:00 UTC.
  // soFar: tonight's window up to this moment (sent on request, not by cron).
  let start: Date
  let end: Date
  if (soFar) {
    end = new Date()
    start = new Date(end)
    start.setUTCHours(12, 0, 0, 0)
    if (start > end) start.setUTCDate(start.getUTCDate() - 1)
  } else {
    end = new Date()
    end.setUTCMinutes(0, 0, 0)
    if (end.getUTCHours() < 22) end.setUTCDate(end.getUTCDate() - 1)
    end.setUTCHours(22)
    start = new Date(end.getTime() - 10 * 3600 * 1000)
  }
  const fmt = (d: Date) => d.toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  const period = `${fmt(start)} – ${fmt(end)}`

  const { data: orders } = await admin
    .from('orders')
    .select('id, order_number, company_order_number, company_id, customer_id, order_items(product_id, name, qty, unit, products(name, category))')
    .neq('status', 'cancelled')
    .gte('created_at', start.toISOString())
    .lt('created_at', end.toISOString())
    .order('created_at')
  if (!orders?.length) {
    await telegram('sendMessage', { chat_id: DOCS_CHAT_ID, text: `Заказов с ${period} не было.` })
    return
  }
  for (const o of orders) await sendOrderDocument(o.id).catch((err) => console.error('order document', o.id, err))
  const rows = new Map<string, XlsxSummaryRow>()
  for (const o of orders) {
    // deno-lint-ignore no-explicit-any
    for (const i of o.order_items as any[]) {
      const unit = UNIT_RU[i.unit] ?? i.unit
      const key = `${i.product_id ?? i.name}|${unit}`
      const p = i.products
      const row = rows.get(key) ?? { name: p?.name ?? i.name, category: p?.category ?? null, unit, total: 0 }
      row.total += Number(i.qty)
      rows.set(key, row)
    }
  }
  const ids = [...new Set(orders.map((o) => o.company_id ?? o.customer_id).filter(Boolean))]
  const { data: companies } = await admin.from('customers').select('id, name, company_name').in('id', ids)
  const nameOf = new Map((companies ?? []).map((c) => [c.id, c.company_name || c.name]))
  const list = orders.map((o) => `${nameOf.get(o.company_id ?? o.customer_id) ?? 'Клиент'} №${o.company_order_number ?? o.order_number}`).join(', ')
  const day = end.toLocaleDateString('ru-RU', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', year: 'numeric' })
  const file = await summaryXlsx('Товары по заказам — нужно списать', `${period} · заказов: ${orders.length} (${list})`, [...rows.values()])
  await sendFile(DOCS_CHAT_ID, file, `Товары по заказам ${day}.xlsx`, `Товары по заказам, ${period}: ${rows.size} поз. из ${orders.length} заказов`)
}

/** A labelled example of both documents, built from real catalog products —
 * so the recipient can see what will arrive at 03:00. */
async function sendSample() {
  const DOCS_CHAT_ID = await docsChatId()
  if (!DOCS_CHAT_ID) return
  const { data: products } = await admin.from('products').select('name, category, unit').eq('active', true).in('category', ['Fruits', 'Vegetables', 'Herbs', 'Dairy']).limit(40)
  const pick = (products ?? []).filter((_, i) => i % 5 === 0).slice(0, 7)
  const lines = pick.map((p, i) => ({ name: p.name.trim(), category: p.category, qty: [10, 2, 5, 1.5, 3, 4, 2][i] ?? 1, unit: UNIT_RU[p.unit] ?? p.unit }))
  const order = await orderXlsx({ number: 1, company: 'ПРИМЕР — Компания', createdAt: new Date().toISOString(), staffRole: 'Повар', contact: 'Иван', phone: '+998 90 000 00 00', lines })
  await sendFile(DOCS_CHAT_ID, order, 'ПРИМЕР накладной.xlsx', 'Пример: так будет выглядеть накладная каждого заказа (17:00–03:00).')
  const summary = await summaryXlsx('Товары по заказам — нужно списать', 'ПРИМЕР · заказов: 1 (ПРИМЕР — Компания №1)', lines.map((l) => ({ ...l, total: l.qty })))
  await sendFile(DOCS_CHAT_ID, summary, 'ПРИМЕР товары по заказам.xlsx', 'Пример: общий список, придёт в 03:00 вместе с накладными.')
}

function formatQty(n: number) {
  return String(Math.round(n * 1000) / 1000).replace('.', ',')
}

interface TgUser {
  id: number
  is_bot?: boolean
  first_name?: string
  last_name?: string
  username?: string
}

interface TgMessage {
  message_id: number
  text?: string
  chat: { id: number; title?: string; type: string }
  from?: TgUser
}

const fullName = (u: TgUser) => [u.first_name, u.last_name].filter(Boolean).join(' ') || (u.username ? `@${u.username}` : String(u.id))

/** Remembers who opened the bot privately — the choices /docs offers. */
async function rememberUser(u: TgUser) {
  await admin.from('telegram_users').upsert({ id: u.id, name: fullName(u), username: u.username ?? null, last_seen: new Date().toISOString() })
}

/** /docs: the current recipient and a button for each person who opened the bot. */
async function showDocsPicker(chatId: number, replyTo: number) {
  const current = await docsChatId()
  const { data: users } = await admin.from('telegram_users').select('id, name, username').order('last_seen', { ascending: false }).limit(20)
  const currentName = users?.find((u) => String(u.id) === current)?.name ?? (current ? `ID ${current}` : 'никто')
  const buttons = (users ?? []).map((u) => [{ text: `${String(u.id) === current ? '✅ ' : ''}${u.name}${u.username ? ` (@${u.username})` : ''}`, callback_data: `docs:${u.id}` }])
  return telegram('sendMessage', {
    chat_id: chatId,
    reply_to_message_id: replyTo,
    allow_sending_without_reply: true,
    text: `Документы заказов сейчас получает: ${currentName}.\n\nКому присылать? Нажмите на человека. Если нужного нет в списке, пусть он откроет этого бота и нажмёт Start, потом снова отправьте /docs.`,
    reply_markup: { inline_keyboard: buttons },
  })
}

interface TgCallback {
  id: string
  from: TgUser
  data?: string
  message?: { message_id: number; chat: { id: number } }
}

async function handleCallback(cb: TgCallback) {
  const answer = (text: string) => telegram('answerCallbackQuery', { callback_query_id: cb.id, text })
  if (cb.data?.startsWith('grp:')) {
    if (!(await isBotAdmin(cb.from.id))) return answer('')
    const chat = Number(cb.data.slice(4))
    const { data: info } = await telegram('getChat', { chat_id: chat })
    await answer('')
    if (cb.message) await askWhichClient(chat, info?.title ?? String(chat), false, { chat: cb.message.chat.id, message: cb.message.message_id })
    return
  }
  if (cb.data?.startsWith('cl:')) {
    if (!(await isBotAdmin(cb.from.id))) return answer('Только для администратора Freshline.')
    const [, chat, customer] = cb.data.split(':')
    await answer('Минуту…')
    await linkFromButton(cb, Number(chat), customer)
    return
  }
  if (cb.data?.startsWith('adm:')) {
    if (!ADMIN_IDS.has(String(cb.from.id))) return answer('Это может только владелец бота.')
    const id = cb.data.slice(4)
    const { data: u } = await admin.from('telegram_users').select('is_admin, name').eq('id', id).maybeSingle()
    if (!u) return answer('Не нашёл этого человека.')
    await admin.from('telegram_users').update({ is_admin: !u.is_admin }).eq('id', id)
    await answer(u.is_admin ? `${u.name}: доступ закрыт` : `${u.name}: доступ открыт`)
    if (cb.message) await showAdminsPicker(cb.message.chat.id, undefined, cb.message.message_id)
    return
  }
  if (!cb.data?.startsWith('docs:')) return answer('')
  if (!(await isBotAdmin(cb.from.id))) return answer('Только для администратора Freshline.')
  const target = cb.data.slice(5)
  const { data: user } = await admin.from('telegram_users').select('name').eq('id', target).maybeSingle()
  const test = await telegram('sendMessage', { chat_id: target, text: 'Теперь вы будете получать документы заказов Freshline: каждую ночь в 03:00 — накладные заказов с 17:00 и общий список «Товары по заказам».' })
  if (!test?.ok) return answer('Не могу написать этому человеку — пусть снова нажмёт Start в боте.')
  await admin.from('telegram_settings').upsert({ key: 'docs_chat_id', value: target, updated_at: new Date().toISOString() })
  await answer('Готово')
  if (cb.message) {
    await telegram('editMessageText', { chat_id: cb.message.chat.id, message_id: cb.message.message_id, text: `Готово: документы заказов теперь получает ${user?.name ?? `ID ${target}`}.` })
  }
}

/** The owner (TELEGRAM_ADMIN_IDS) or someone the owner allowed with /admins. */
async function isBotAdmin(userId: number | undefined): Promise<boolean> {
  if (userId == null) return false
  if (ADMIN_IDS.has(String(userId))) return true
  const { data } = await admin.from('telegram_users').select('is_admin').eq('id', userId).maybeSingle()
  return !!data?.is_admin
}

/** /admins: everyone who opened the bot, tap to allow or revoke managing it. */
async function showAdminsPicker(chatId: number, replyTo?: number, editMessageId?: number) {
  const { data: users } = await admin.from('telegram_users').select('id, name, username, is_admin').order('last_seen', { ascending: false }).limit(30)
  const buttons = (users ?? [])
    .filter((u) => !ADMIN_IDS.has(String(u.id)))
    .map((u) => [{ text: `${u.is_admin ? '✅' : '⬜️'} ${u.name}${u.username ? ` (@${u.username})` : ''}`, callback_data: `adm:${u.id}` }])
  const text = buttons.length
    ? 'Кто может управлять ботом (привязывать группы, выбирать получателя документов)? Нажмите, чтобы разрешить ✅ или запретить ⬜️.'
    : 'Пока никто, кроме вас, не открывал бота. Пусть человек откроет бота и нажмёт Start, потом снова отправьте /admins.'
  if (editMessageId) return telegram('editMessageText', { chat_id: chatId, message_id: editMessageId, text, reply_markup: { inline_keyboard: buttons } })
  return telegram('sendMessage', { chat_id: chatId, reply_to_message_id: replyTo, allow_sending_without_reply: true, text, reply_markup: { inline_keyboard: buttons } })
}

const ADMIN_START = [
  'Здравствуйте! Вы можете управлять ботом. Всё делается здесь, в личке — в группах бот не принимает никаких команд.',
  '',
  'Когда бота добавят в группу, сюда придёт вопрос, чей это клиент.',
  '/groups — группы и их клиенты, сменить клиента или отвязать',
  DOCS_HELP,
].join('\n')

/** /groups: every linked group with its client; a tap opens the client picker for it. */
async function showGroups(chatId: number, replyTo: number) {
  const { data: chats } = await admin.from('telegram_chats').select('chat_id, title, customers(name, company_name)').order('linked_at', { ascending: false }).limit(50)
  // deno-lint-ignore no-explicit-any
  const buttons = (chats ?? []).map((c: any) => [{ text: `${c.title ?? c.chat_id} → ${c.customers?.company_name || c.customers?.name || '?'}`, callback_data: `grp:${c.chat_id}` }])
  return telegram('sendMessage', {
    chat_id: chatId,
    reply_to_message_id: replyTo,
    allow_sending_without_reply: true,
    text: buttons.length ? 'Группы и их клиенты. Нажмите на группу, чтобы сменить клиента или отвязать её.' : 'Пока ни одна группа не привязана.',
    reply_markup: { inline_keyboard: buttons },
  })
}

async function handleCommand(msg: TgMessage, text: string) {
  // Commands exist only in a private chat with someone who manages the bot.
  // In groups — and for everyone else — the bot doesn't answer at all.
  if (msg.chat.type !== 'private' || !(await isBotAdmin(msg.from?.id))) return
  const [rawCmd, ...args] = text.trim().split(/\s+/)
  // "/id." or "/docs@freshline_bot" → "/id", "/docs".
  const cmd = rawCmd.split('@')[0].toLowerCase().replace(/[^a-z/]/g, '')
  const isOwner = !!msg.from && ADMIN_IDS.has(String(msg.from.id))

  if (cmd === '/start' || cmd === '/help') {
    return reply(msg.chat.id, msg.message_id, esc(isOwner ? `${ADMIN_START}\n/admins — кто ещё может управлять ботом` : ADMIN_START))
  }
  if (cmd === '/id') {
    return reply(msg.chat.id, msg.message_id, `Ваш ID в Telegram: <code>${msg.from?.id ?? '—'}</code>`)
  }
  if (cmd === '/groups') return showGroups(msg.chat.id, msg.message_id)
  if (cmd === '/admins') {
    if (!isOwner) return reply(msg.chat.id, msg.message_id, 'Это может только владелец бота.')
    return showAdminsPicker(msg.chat.id, msg.message_id)
  }
  if (cmd === '/docs' || cmd === '/docsme') {
    // Plain /docs shows the buttons; "/docs 123456789" and /docs_me still work.
    const target = cmd === '/docs' ? args[0]?.replace(/[^\d-]/g, '') : String(msg.from!.id)
    if (!target) return showDocsPicker(msg.chat.id, msg.message_id)
    const test = await telegram('sendMessage', { chat_id: target, text: 'Теперь вы будете получать документы заказов Freshline: каждую ночь в 03:00 — накладные заказов с 17:00 и общий список «Товары по заказам».' })
    if (!test?.ok) {
      return reply(msg.chat.id, msg.message_id, `Не могу написать ID <code>${esc(target)}</code>. Пусть этот человек откроет бота и нажмёт Start, потом повторите.`)
    }
    await admin.from('telegram_settings').upsert({ key: 'docs_chat_id', value: target, updated_at: new Date().toISOString() })
    return reply(msg.chat.id, msg.message_id, `Готово: документы теперь получает ID <code>${esc(target)}</code>.`)
  }
}

async function loadCatalog() {
  const { data: products, error } = await admin
    .from('products')
    .select('id, name, name_uz_cyrl, name_uz_latn, name_en, unit, sku')
    .eq('active', true)
    .order('sku')
  if (error) console.error(error)
  return prepareCatalog((products ?? []) as CatalogProduct[])
}

async function handleOrder(msg: TgMessage, text: string) {
  const lines = parseOrderText(text, await loadCatalog())
  if (!lines.some((l) => l.product && l.qty)) return // ordinary chat

  const { data: link } = await admin.from('telegram_chats').select('customer_id').eq('chat_id', msg.chat.id).maybeSingle()
  if (link) return placeFromText(msg.chat.id, msg.message_id, text)

  // A group nobody linked yet: the order is placed right away without a
  // client, and the admins pick the client with a button afterwards.
  const placed = await placeFromText(msg.chat.id, msg.message_id, text, msg.chat.title ?? 'без названия')
  // Normally the admins were already asked when the bot joined the group.
  if (placed && !placed.merged && !(await alreadyAsked(msg.chat.id))) await askWhichClient(msg.chat.id, msg.chat.title ?? 'без названия')
}

/** Turns one message into an order (or a follow-up) for the group's client and answers in the group. */
async function placeFromText(chatId: number, messageId: number, text: string, unlinkedTitle?: string) {
  const lines = parseOrderText(text, await loadCatalog())
  const ok = lines.filter((l) => l.product && l.qty)
  if (ok.length === 0) return
  const unknown = lines.filter((l) => !l.product && l.qty)
  // Only a clear product name without a number — not section headings like "🌾 Un mahsulotlari".
  const noQty = lines.filter((l) => l.product && !l.qty && l.score >= 0.9 && !/^\P{L}/u.test(l.text))
  const notes = [
    unknown.length ? `Telegram, не распознано: ${unknown.map((l) => l.text).join('; ')}` : '',
    noQty.length ? `Telegram, без количества: ${noQty.map((l) => l.text).join('; ')}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const items = ok.map((l) => ({ product_id: l.product!.id, qty: l.qty, unit: l.unit }))
  const { data: placed, error: placeError } = unlinkedTitle
    ? await admin.rpc('telegram_place_order_unlinked', { p_chat_id: chatId, p_title: unlinkedTitle, p_items: items, p_notes: notes })
    : await admin.rpc('telegram_place_order', { p_chat_id: chatId, p_items: items, p_notes: notes })
  if (placeError || !placed) {
    console.error(placeError)
    const why = /payment is not enabled|not enabled/.test(placeError?.message ?? '')
      ? 'у клиента не включён способ оплаты'
      : 'ошибка на сервере'
    await reply(chatId, messageId, `Не удалось оформить заказ (${why}). Мы уже видим это и свяжемся с вами.`)
    return null
  }

  // Before a client is chosen there's no company number yet, so none is shown.
  const no = unlinkedTitle ? '' : ` №${placed.number}`
  const head = placed.merged ? `➕ Добавлено в заказ${no}:` : `✅ Заказ${no} принят:`
  const body = ok.map((l) => `• ${esc(l.product!.name.trim())} — ${formatQty(l.qty!)} ${esc(l.unit)}`).join('\n')
  const extra = [
    unknown.length ? `\n⚠️ Не понял, уточните, пожалуйста:\n${unknown.map((l) => `• ${esc(l.text)}`).join('\n')}` : '',
    noQty.length ? `\n❓ Не указано количество:\n${noQty.map((l) => `• ${esc(l.text)}`).join('\n')}` : '',
  ].join('')
  await reply(chatId, messageId, `${head}\n${body}${extra}`)
  return placed
}

/** Everyone who manages the bot: the owner(s) and people allowed with /admins. */
async function adminChatIds(): Promise<string[]> {
  const { data } = await admin.from('telegram_users').select('id').eq('is_admin', true)
  return [...new Set([...ADMIN_IDS, ...(data ?? []).map((u) => String(u.id))])]
}

async function alreadyAsked(chatId: number) {
  const { data } = await admin.from('telegram_settings').select('key').eq('key', `asked:${chatId}`).maybeSingle()
  return !!data
}

/** Private message to the admins: "New group — whose client is it?" with a button per client. */
async function askWhichClient(chatId: number, title: string, justAdded = false, onlyTo?: { chat: number; message: number }) {
  await admin.from('telegram_settings').upsert({ key: `asked:${chatId}`, value: title, updated_at: new Date().toISOString() })
  const { data: clients } = await admin
    .from('customers')
    .select('id, name, company_name')
    .is('parent_customer_id', null)
    .neq('status', 'inactive')
    .order('name')
    .limit(80)
  const label = (c: { name: string; company_name: string | null }) => (c.company_name || c.name).trim()
  // Clients whose name appears in the group title go first.
  const t = title.toLowerCase()
  const list = (clients ?? []).sort((a, b) => Number(t.includes(label(b).toLowerCase())) - Number(t.includes(label(a).toLowerCase())))
  const rows: { text: string; callback_data: string }[][] = []
  for (let i = 0; i < list.length; i += 2) rows.push(list.slice(i, i + 2).map((c) => ({ text: label(c), callback_data: `cl:${chatId}:${c.id}` })))
  if (onlyTo) rows.push([{ text: '⛓️‍💥 Отвязать группу (заказы не принимаются)', callback_data: `cl:${chatId}:unlink` }])
  rows.push([{ text: '🚫 Не принимать заказы из этой группы', callback_data: `cl:${chatId}:ignore` }])
  if (onlyTo) {
    return telegram('editMessageText', { chat_id: onlyTo.chat, message_id: onlyTo.message, text: `Группа «${title}». Выберите клиента:`, reply_markup: { inline_keyboard: rows } })
  }
  for (const id of await adminChatIds()) {
    await telegram('sendMessage', {
      chat_id: id,
      text: justAdded
        ? `Бота добавили в группу «${title}». Чей это клиент? Нажмите — и заказы из группы будут оформляться на него.`
        : `Новая группа «${title}» прислала заказ — он уже на сайте, но без клиента. Чей это клиент? Нажмите — группа привяжется, и заказ перейдёт к нему.`,
      reply_markup: { inline_keyboard: rows },
    })
  }
}

/** An admin picked the client for a new group: link it and hand over its orders. */
async function linkFromButton(cb: TgCallback, chatId: number, customerId: string) {
  const { data: chat } = await telegram('getChat', { chat_id: chatId })
  const title: string = chat?.title ?? 'группа'
  const edit = (text: string) =>
    cb.message ? telegram('editMessageText', { chat_id: cb.message.chat.id, message_id: cb.message.message_id, text }) : Promise.resolve()

  if (customerId === 'unlink') {
    await admin.from('telegram_chats').delete().eq('chat_id', chatId)
    await admin.from('telegram_settings').delete().eq('key', `asked:${chatId}`)
    return edit(`Группа «${title}» отвязана. Её новые заказы придут без клиента, и бот снова спросит, чей это клиент.`)
  }
  if (customerId === 'ignore') {
    // Its client-less orders are cancelled, and the bot leaves the group.
    await admin.from('orders').update({ status: 'cancelled' }).eq('telegram_chat_id', chatId).is('customer_id', null)
    await admin.from('telegram_chats').delete().eq('chat_id', chatId)
    await telegram('leaveChat', { chat_id: chatId })
    return edit(`Группа «${title}»: заказы не принимаются, её заказы отменены, бот вышел из группы.`)
  }
  const { data: client } = await admin.from('customers').select('name, company_name').eq('id', customerId).maybeSingle()
  if (!client) return edit('Не нашёл этого клиента.')
  const { data: moved, error } = await admin.rpc('telegram_assign_chat', { p_chat_id: chatId, p_customer_id: customerId, p_title: title })
  if (error) {
    console.error(error)
    return edit('Не получилось привязать группу, попробуйте ещё раз.')
  }
  return edit(`Готово: группа «${title}» → ${client.company_name || client.name}. ${moved ? `Заказов передано клиенту: ${moved}.` : 'Заказы из группы будут оформляться на него.'}`)
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
        allowed_updates: ['message', 'callback_query', 'my_chat_member'],
      })
      const info = await telegram('getWebhookInfo', {})
      return json({ setWebhook: result, allowed_updates: info?.result?.allowed_updates ?? null, pending: info?.result?.pending_update_count ?? null })
    }

    // Calls from the database itself (migration 0064): a new order placed in
    // the app, and the daily summary from pg_cron.
    const dbSecret = req.headers.get('x-webhook-secret')
    if (dbSecret) {
      if (!DB_SECRET || dbSecret !== DB_SECRET) return json({ error: 'Unauthorized' }, 401)
      const body = await req.json()
      // Answer the database right away; building and sending the PDFs keeps
      // running in the background (pg_net gives up waiting after seconds).
      const work =
        body.kind === 'daily' ? sendNightBatch() : body.kind === 'now' ? sendNightBatch(true) : body.kind === 'sample' ? sendSample() : Promise.resolve()
      const done = work.catch((err) => console.error(body.kind, err))
      // deno-lint-ignore no-explicit-any
      const runtime = (globalThis as any).EdgeRuntime
      if (runtime?.waitUntil) runtime.waitUntil(done)
      else await done
      return json({ ok: true }, 202)
    }

    if (req.headers.get('x-telegram-bot-api-secret-token') !== WEBHOOK_SECRET) {
      return json({ error: 'Unauthorized' }, 401)
    }

    const update = await req.json()
    // The bot was added to a group: ask the admins right away whose client it is.
    const member = update.my_chat_member
    if (member && ['group', 'supergroup'].includes(member.chat?.type)) {
      const nowIn = ['member', 'administrator'].includes(member.new_chat_member?.status)
      const wasIn = ['member', 'administrator'].includes(member.old_chat_member?.status)
      if (nowIn && !wasIn) {
        const { data: linked } = await admin.from('telegram_chats').select('chat_id').eq('chat_id', member.chat.id).maybeSingle()
        if (!linked) await askWhichClient(member.chat.id, member.chat.title ?? 'без названия', true)
      }
      return json({ ok: true })
    }
    if (update.callback_query) {
      await handleCallback(update.callback_query)
      return json({ ok: true })
    }
    const msg: TgMessage | undefined = update.message
    if (msg?.chat.type === 'private' && msg.from && !msg.from.is_bot) await rememberUser(msg.from).catch((err) => console.error('remember user', err))
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
