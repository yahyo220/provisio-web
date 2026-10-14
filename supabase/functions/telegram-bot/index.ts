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

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')
const WEBHOOK_SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET')
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
  const cmd = rawCmd.split('@')[0].toLowerCase()
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
