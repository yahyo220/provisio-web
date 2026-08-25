import { formatMoney, formatOrderDate, formatRelative, initialsOf } from './format'
import { placeholderImage, type OrderLineItem } from './data'
import { supabase } from './supabase'
import type {
  ApprovalStatus,
  CustomerRow,
  DeliveryRow,
  DeliveryStatus,
  DriverRow,
  OrderRow,
  OrderStatus,
  PaymentStatus,
  PriceTier,
  ProductRow,
  StockStatus,
} from './types'

function assertClient() {
  if (!supabase) throw new Error('Supabase is not configured — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  return supabase
}

export interface FetchedData {
  products: ProductRow[]
  customers: CustomerRow[]
  orders: OrderRow[]
  deliveries: DeliveryRow[]
  drivers: string[]
  driverRows: DriverRow[]
}

/** Pulls every table in parallel and joins everything client-side — simple and
 * predictable, and fine at the row counts a B2B dashboard like this deals with. */
export async function fetchAll(): Promise<FetchedData> {
  const db = assertClient()

  const [productsRes, customersRes, ordersRes, itemsRes, deliveriesRes, driversRes] = await Promise.all([
    db.from('products').select('*').order('updated_at', { ascending: false }),
    db.from('customers').select('*').order('created_at', { ascending: false }),
    db.from('orders').select('*').order('created_at', { ascending: false }),
    db.from('order_items').select('order_id, qty, unit_price'),
    db.from('deliveries').select('*').order('created_at', { ascending: false }),
    db.from('drivers').select('*').order('name', { ascending: true }),
  ])

  for (const res of [productsRes, customersRes, ordersRes, itemsRes, deliveriesRes, driversRes]) {
    if (res.error) throw res.error
  }

  const products: ProductRow[] = (productsRes.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    sku: row.sku,
    category: row.category,
    price: formatMoney(Number(row.price)),
    priceExternal: row.price_external != null ? formatMoney(Number(row.price_external)) : '',
    unit: row.unit,
    units: Array.isArray(row.units) ? row.units : [],
    stock: row.stock as StockStatus,
    active: row.active,
    updated: formatRelative(row.updated_at),
    image: row.image_url || placeholderImage,
  }))

  const totalsByOrder = new Map<string, number>()
  for (const item of itemsRes.data ?? []) {
    totalsByOrder.set(item.order_id, (totalsByOrder.get(item.order_id) ?? 0) + item.qty * Number(item.unit_price))
  }

  const customersById = new Map((customersRes.data ?? []).map((c) => [c.id, c]))
  const ordersByCustomer = new Map<string, number>()
  const spentByCustomer = new Map<string, number>()

  const orders: OrderRow[] = (ordersRes.data ?? []).map((row) => {
    const customer = row.customer_id ? customersById.get(row.customer_id) : null
    const total = (totalsByOrder.get(row.id) ?? 0) + Number(row.delivery_fee ?? 0)
    if (row.customer_id) {
      ordersByCustomer.set(row.customer_id, (ordersByCustomer.get(row.customer_id) ?? 0) + 1)
      spentByCustomer.set(row.customer_id, (spentByCustomer.get(row.customer_id) ?? 0) + total)
    }
    return {
      id: row.id,
      orderNumber: row.order_number,
      customerId: row.customer_id,
      customer: customer?.name ?? '—',
      meta: customer ? `${customer.type} · ${customer.location ?? ''}`.replace(/ · $/, '') : '—',
      date: formatOrderDate(row.created_at),
      createdAt: row.created_at,
      total: formatMoney(total),
      deliveryFee: Number(row.delivery_fee ?? 0),
      payment: row.payment as PaymentStatus,
      status: row.status as OrderStatus,
      products: undefined,
    }
  })

  const customers: CustomerRow[] = (customersRes.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    contact: row.contact || '—',
    phone: row.phone || '',
    email: row.email || '',
    location: row.location || '—',
    orders: ordersByCustomer.get(row.id) ?? 0,
    spent: formatMoney(spentByCustomer.get(row.id) ?? 0),
    status: row.status as CustomerRow['status'],
    initials: initialsOf(row.name),
    approvalStatus: (row.approval_status ?? 'approved') as ApprovalStatus,
    priceTier: (row.price_tier ?? 'no_price') as PriceTier,
    hasLogin: Boolean(row.auth_user_id),
  }))

  const driverRows: DriverRow[] = (driversRes.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    phone: row.phone || '',
    active: row.active ?? true,
    hasLogin: Boolean(row.auth_user_id),
  }))

  const driversById = new Map((driversRes.data ?? []).map((d) => [d.id, d]))
  const ordersById = new Map((ordersRes.data ?? []).map((o) => [o.id, o]))

  const deliveries: DeliveryRow[] = (deliveriesRes.data ?? []).map((row) => {
    const order = row.order_id ? ordersById.get(row.order_id) : null
    const driver = row.driver_id ? driversById.get(row.driver_id) : null
    return {
      id: row.id,
      orderId: order ? `#${order.order_number}` : '—',
      orderDbId: row.order_id ?? null,
      customer: order?.customer_id ? (customersById.get(order.customer_id)?.name ?? '—') : '—',
      address: row.address || '—',
      driver: driver?.name ?? '—',
      eta: row.eta || '—',
      status: row.status as DeliveryStatus,
    }
  })

  const drivers = (driversRes.data ?? []).map((d) => d.name)

  return { products, customers, orders, deliveries, drivers, driverRows }
}

export async function insertProduct(product: {
  name: string
  sku: string
  category: string
  price: number
  priceExternal?: number | null
  unit: string
  units?: string[]
  stock: StockStatus
  active: boolean
  imageUrl?: string
}) {
  const db = assertClient()
  const { error } = await db.from('products').insert({
    name: product.name,
    sku: product.sku,
    category: product.category,
    price: product.price,
    price_external: product.priceExternal ?? null,
    unit: product.unit,
    units: product.units && product.units.length > 0 ? product.units : null,
    stock: product.stock,
    active: product.active,
    image_url: product.imageUrl ?? null,
  })
  if (error) throw error
}

export async function updateProductRow(id: string, patch: Partial<ProductRow>) {
  const db = assertClient()
  const dbPatch: Record<string, unknown> = {}
  if (patch.name !== undefined) dbPatch.name = patch.name
  if (patch.category !== undefined) dbPatch.category = patch.category
  if (patch.price !== undefined) dbPatch.price = Number(String(patch.price).replace(/[^\d.]/g, ''))
  if (patch.priceExternal !== undefined) {
    const cleaned = String(patch.priceExternal).replace(/[^\d.]/g, '')
    dbPatch.price_external = cleaned ? Number(cleaned) : null
  }
  if (patch.unit !== undefined) dbPatch.unit = patch.unit
  if (patch.units !== undefined) dbPatch.units = patch.units.length > 0 ? patch.units : null
  if (patch.stock !== undefined) dbPatch.stock = patch.stock
  if (patch.active !== undefined) dbPatch.active = patch.active
  const { error } = await db.from('products').update(dbPatch).eq('id', id)
  if (error) throw error
}

export async function deleteProductRow(id: string) {
  const db = assertClient()
  const { error } = await db.from('products').delete().eq('id', id)
  if (error) throw error
}

export async function insertCustomer(customer: {
  name: string
  type: string
  contact: string
  location: string
}) {
  const db = assertClient()
  const { error } = await db.from('customers').insert({
    name: customer.name,
    type: customer.type,
    contact: customer.contact,
    location: customer.location,
    status: 'active',
  })
  if (error) throw error
}

export async function updateCustomerRow(id: string, patch: Partial<CustomerRow>) {
  const db = assertClient()
  const dbPatch: Record<string, unknown> = {}
  if (patch.name !== undefined) dbPatch.name = patch.name
  if (patch.type !== undefined) dbPatch.type = patch.type
  if (patch.contact !== undefined) dbPatch.contact = patch.contact
  if (patch.location !== undefined) dbPatch.location = patch.location
  if (patch.status !== undefined) dbPatch.status = patch.status
  if (patch.approvalStatus !== undefined) dbPatch.approval_status = patch.approvalStatus
  if (patch.priceTier !== undefined) dbPatch.price_tier = patch.priceTier
  const { error } = await db.from('customers').update(dbPatch).eq('id', id)
  if (error) throw error
}

/** Calls the `create-account` edge function (service-role) to give a courier
 * a real login. Only succeeds if the caller is signed in as an admin. */
export async function createCourierAccount(input: { name: string; phone: string; email: string; password: string }) {
  const db = assertClient()
  const { data: sessionData } = await db.auth.getSession()
  if (!sessionData.session) throw new Error('Not signed in.')

  const { data, error } = await db.functions.invoke('create-account', {
    body: { role: 'courier', name: input.name, phone: input.phone, email: input.email, password: input.password },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}

export async function updateDeliveryRow(id: string, patch: Partial<DeliveryRow>) {
  const db = assertClient()
  const dbPatch: Record<string, unknown> = {}
  if (patch.address !== undefined) dbPatch.address = patch.address
  if (patch.eta !== undefined) dbPatch.eta = patch.eta
  if (patch.status !== undefined) dbPatch.status = patch.status
  if (patch.driver !== undefined) {
    dbPatch.driver_id = await resolveDriverId(patch.driver)
  }
  const { error } = await db.from('deliveries').update(dbPatch).eq('id', id)
  if (error) throw error
}

/** Finds a driver by name, creating the row on first use — keeps the UI's plain
 * "pick a name" flow working without a separate driver-management screen yet. */
async function resolveDriverId(name: string): Promise<string> {
  const db = assertClient()
  const existing = await db.from('drivers').select('id').eq('name', name).maybeSingle()
  if (existing.data) return existing.data.id
  const created = await db.from('drivers').insert({ name }).select('id').single()
  if (created.error) throw created.error
  return created.data.id
}

export async function assignDriverToDelivery(deliveryId: string, driverName: string) {
  const db = assertClient()
  const driverId = await resolveDriverId(driverName)
  const { error } = await db.from('deliveries').update({ driver_id: driverId }).eq('id', deliveryId)
  if (error) throw error
}

export async function updateOrderStatus(id: string, status: string) {
  const db = assertClient()
  const { error } = await db.from('orders').update({ status }).eq('id', id)
  if (error) throw error
}

export async function deleteOrderRow(id: string) {
  const db = assertClient()
  const { error } = await db.from('orders').delete().eq('id', id)
  if (error) throw error
}

export async function fetchOrderItems(orderId: string): Promise<OrderLineItem[]> {
  const db = assertClient()
  const { data, error } = await db
    .from('order_items')
    .select('*')
    .eq('order_id', orderId)
    .order('id', { ascending: true })
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    sku: row.sku ?? '',
    qty: row.qty,
    unit: row.unit,
    unitPrice: Number(row.unit_price),
    image: row.image_url || placeholderImage,
  }))
}

export async function updateOrderItemQty(itemId: string, qty: number) {
  const db = assertClient()
  const { error } = await db.from('order_items').update({ qty }).eq('id', itemId)
  if (error) throw error
}

export interface OrderFeedbackRow {
  id: string
  message: string
  photoUrls: string[]
  createdAt: string
}

export async function fetchOrderFeedback(orderId: string): Promise<OrderFeedbackRow[]> {
  const db = assertClient()
  const { data, error } = await db
    .from('order_feedback')
    .select('id, message, photo_urls, created_at')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    message: row.message,
    photoUrls: Array.isArray(row.photo_urls) ? row.photo_urls : [],
    createdAt: row.created_at,
  }))
}

export interface SupportMessageRow {
  id: string
  customerId: string
  sender: 'customer' | 'admin'
  message: string
  createdAt: string
}

export async function fetchSupportThreads(): Promise<{ customerId: string; lastMessage: string; lastAt: string; unread: boolean }[]> {
  const db = assertClient()
  const { data, error } = await db.from('support_messages').select('customer_id, sender, message, created_at').order('created_at', { ascending: true })
  if (error) throw error
  const byCustomer = new Map<string, { lastMessage: string; lastAt: string; unread: boolean }>()
  for (const row of data ?? []) {
    byCustomer.set(row.customer_id, {
      lastMessage: row.message,
      lastAt: row.created_at,
      unread: row.sender === 'customer',
    })
  }
  return Array.from(byCustomer.entries())
    .map(([customerId, v]) => ({ customerId, ...v }))
    .sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1))
}

export async function fetchSupportMessages(customerId: string): Promise<SupportMessageRow[]> {
  const db = assertClient()
  const { data, error } = await db
    .from('support_messages')
    .select('id, customer_id, sender, message, created_at')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    customerId: row.customer_id,
    sender: row.sender as 'customer' | 'admin',
    message: row.message,
    createdAt: row.created_at,
  }))
}

export async function sendSupportMessage(customerId: string, message: string) {
  const db = assertClient()
  const { error } = await db.from('support_messages').insert({ customer_id: customerId, sender: 'admin', message })
  if (error) throw error
}
