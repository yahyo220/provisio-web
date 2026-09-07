// Provisio — turns the raw rows DataContext already has (orders, order
// items, customers, deliveries) into the numbers Dashboard/Customers/
// Deliveries actually show. These used to be permanently-empty stub
// exports in data.ts (demo content was cleared out and never replaced
// with real computation) -- every KPI, chart and breakdown on the site
// read as "broken" even with real paid orders in the database, because
// nothing here was ever wired to the live data at all.
import type { RevenueRange } from './data'
import { formatMoney } from './format'
import type { CustomerRow, DeliveryRow, OrderItemRow, OrderRow, OrderStatus, ProductRow } from './types'

export type { RevenueRange }

const RANGE_DAYS: Record<RevenueRange, number> = { '1W': 7, '1M': 30, '3M': 90, '1Y': 365 }

function startOfDay(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  return out
}

function daysAgo(n: number, from = new Date()): Date {
  const out = startOfDay(from)
  out.setDate(out.getDate() - n)
  return out
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function pctDelta(today: number, yesterday: number): { delta: string; direction: 'up' | 'down' } {
  if (yesterday === 0) return { delta: today > 0 ? '+100%' : '0%', direction: today >= 0 ? 'up' : 'down' }
  const pct = Math.round(((today - yesterday) / yesterday) * 100)
  return { delta: `${pct >= 0 ? '+' : ''}${pct}%`, direction: pct >= 0 ? 'up' : 'down' }
}

const ACTIVE_ORDER_STATUSES: OrderStatus[] = ['new', 'confirmed', 'preparing', 'ready']

export interface DashboardKpi {
  label: string
  value: string
  delta: string
  ref: string
  direction: 'up' | 'down'
  icon: 'package' | 'box' | 'alert'
}

export function computeDashboardKpis(orders: OrderRow[], customers: CustomerRow[]): DashboardKpi[] {
  const now = new Date()
  const today = startOfDay(now)
  const yesterday = daysAgo(1, now)

  const ordersToday = orders.filter((o) => isSameDay(new Date(o.createdAt), today) && o.status !== 'cancelled')
  const ordersYesterday = orders.filter((o) => isSameDay(new Date(o.createdAt), yesterday) && o.status !== 'cancelled')
  const revenueToday = ordersToday.reduce((sum, o) => sum + o.totalRaw, 0)
  const revenueYesterday = ordersYesterday.reduce((sum, o) => sum + o.totalRaw, 0)
  const pending = orders.filter((o) => ACTIVE_ORDER_STATUSES.includes(o.status)).length
  const inDelivery = orders.filter((o) => o.status === 'out').length
  const completedToday = ordersToday.filter((o) => o.status === 'delivered').length
  const completedYesterday = ordersYesterday.filter((o) => o.status === 'delivered').length

  const revDelta = pctDelta(revenueToday, revenueYesterday)
  const ordDelta = pctDelta(ordersToday.length, ordersYesterday.length)
  const compDelta = pctDelta(completedToday, completedYesterday)

  return [
    { label: "Today's revenue", value: formatMoney(revenueToday), delta: revDelta.delta, ref: 'vs yesterday', direction: revDelta.direction, icon: 'package' },
    { label: "Today's orders", value: `${ordersToday.length}`, delta: ordDelta.delta, ref: 'vs yesterday', direction: ordDelta.direction, icon: 'box' },
    { label: 'Pending orders', value: `${pending}`, delta: '', ref: 'since noon', direction: 'up', icon: 'alert' },
    { label: 'In delivery', value: `${inDelivery}`, delta: '', ref: 'since noon', direction: 'up', icon: 'package' },
    { label: 'Completed today', value: `${completedToday}`, delta: compDelta.delta, ref: 'vs yesterday', direction: compDelta.direction, icon: 'box' },
    { label: 'Total customers', value: `${customers.length}`, delta: '', ref: 'this month', direction: 'up', icon: 'package' },
  ]
}

export interface RevenueChart {
  stat: string
  periodKey: string
  points: string
  axis: string[]
}

const PERIOD_KEY: Record<RevenueRange, string> = {
  '1W': 'last7days',
  '1M': 'last30days',
  '3M': 'last3months',
  '1Y': 'last12months',
}

/** 8 evenly-spaced buckets across the range's day span -- same bucket count
 * for every range so the SVG plotting code doesn't need to special-case
 * anything; only how many days each bucket covers changes. */
export function computeRevenueChart(orders: OrderRow[], range: RevenueRange): RevenueChart {
  const bucketCount = 8
  const spanDays = RANGE_DAYS[range]
  const now = new Date()
  const rangeStart = daysAgo(spanDays - 1, now)
  const bucketDays = spanDays / bucketCount

  const buckets = new Array(bucketCount).fill(0) as number[]
  const bucketDates: Date[] = []
  for (let i = 0; i < bucketCount; i++) {
    const d = new Date(rangeStart)
    d.setDate(d.getDate() + Math.round(i * bucketDays))
    bucketDates.push(d)
  }

  let total = 0
  for (const o of orders) {
    if (o.status === 'cancelled') continue
    const created = new Date(o.createdAt)
    if (created < rangeStart) continue
    const dayOffset = Math.floor((created.getTime() - rangeStart.getTime()) / 86400000)
    if (dayOffset < 0) continue
    const idx = Math.min(bucketCount - 1, Math.floor(dayOffset / bucketDays))
    buckets[idx] += o.totalRaw
    total += o.totalRaw
  }

  const max = Math.max(...buckets, 1)
  const points = buckets
    .map((v, i) => {
      const x = Math.round((i / (bucketCount - 1)) * 640)
      const y = 200 - Math.round((v / max) * 160)
      return `${x},${y}`
    })
    .join(' ')

  const axis = bucketDates.map((d) => `${d.getDate()}.${d.getMonth() + 1}`)

  return { stat: formatMoney(total), periodKey: PERIOD_KEY[range], points, axis }
}

function ordersInRange(orders: OrderRow[], range: RevenueRange): Set<string> {
  const rangeStart = daysAgo(RANGE_DAYS[range] - 1)
  const ids = new Set<string>()
  for (const o of orders) {
    if (o.status === 'cancelled') continue
    if (new Date(o.createdAt) >= rangeStart) ids.add(o.id)
  }
  return ids
}

export function computeCategoryBreakdown(
  orders: OrderRow[],
  orderItems: OrderItemRow[],
  products: ProductRow[],
  range: RevenueRange,
): { name: string; pct: number }[] {
  const inRange = ordersInRange(orders, range)
  const productById = new Map(products.map((p) => [p.id, p]))
  const revenueByCategory = new Map<string, number>()
  let total = 0

  for (const item of orderItems) {
    if (!inRange.has(item.orderId)) continue
    const product = item.productId ? productById.get(item.productId) : undefined
    if (!product) continue
    const revenue = item.qty * item.unitPrice
    revenueByCategory.set(product.category, (revenueByCategory.get(product.category) ?? 0) + revenue)
    total += revenue
  }

  if (total === 0) return []

  return Array.from(revenueByCategory.entries())
    .map(([name, revenue]) => ({ name, pct: Math.round((revenue / total) * 100) }))
    .sort((a, b) => b.pct - a.pct)
}

export interface TopProduct {
  id: string
  name: string
  category: string
  price: string
  unit: string
  units: string
  image: string
}

export function computeTopProducts(
  orders: OrderRow[],
  orderItems: OrderItemRow[],
  products: ProductRow[],
  range: RevenueRange,
  limit = 6,
): TopProduct[] {
  const inRange = ordersInRange(orders, range)
  const qtyByProduct = new Map<string, number>()

  for (const item of orderItems) {
    if (!inRange.has(item.orderId) || !item.productId) continue
    qtyByProduct.set(item.productId, (qtyByProduct.get(item.productId) ?? 0) + item.qty)
  }

  const productById = new Map(products.map((p) => [p.id, p]))
  return Array.from(qtyByProduct.entries())
    .map(([id, qty]) => ({ product: productById.get(id), qty }))
    .filter((x): x is { product: ProductRow; qty: number } => Boolean(x.product))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, limit)
    .map(({ product, qty }) => ({
      id: product.id,
      name: product.name,
      category: product.category,
      price: product.price,
      unit: product.unit,
      units: `×${qty}`,
      image: product.image,
    }))
}

export interface DeliveryKpi {
  label: string
  value: string
  delta: string
  ref: string
  direction: 'up' | 'down'
}

export function computeDeliveryKpis(deliveries: DeliveryRow[]): DeliveryKpi[] {
  const today = startOfDay(new Date())
  const yesterday = daysAgo(1)

  const deliveredToday = (d: DeliveryRow, day: Date) => isSameDay(new Date(d.createdAt), day) && d.status === 'delivered'
  const placedToday = (d: DeliveryRow, day: Date) => isSameDay(new Date(d.createdAt), day)

  const todaysCount = deliveries.filter((d) => placedToday(d, today)).length
  const yesterdaysCount = deliveries.filter((d) => placedToday(d, yesterday)).length
  const inTransit = deliveries.filter((d) => d.status === 'in-transit').length
  const delayed = deliveries.filter((d) => d.status === 'delayed').length
  const completedToday = deliveries.filter((d) => deliveredToday(d, today)).length
  const completedYesterday = deliveries.filter((d) => deliveredToday(d, yesterday)).length

  const countDelta = pctDelta(todaysCount, yesterdaysCount)
  const compDelta = pctDelta(completedToday, completedYesterday)

  return [
    { label: "Today's deliveries", value: `${todaysCount}`, delta: countDelta.delta, ref: 'vs yesterday', direction: countDelta.direction },
    { label: 'In transit', value: `${inTransit}`, delta: '', ref: 'since noon', direction: 'up' },
    { label: 'Delayed', value: `${delayed}`, delta: '', ref: 'since noon', direction: delayed > 0 ? 'down' : 'up' },
    { label: 'Completed today', value: `${completedToday}`, delta: compDelta.delta, ref: 'vs yesterday', direction: compDelta.direction },
  ]
}

export interface CustomerKpi {
  label: string
  value: string
  delta: string
  ref: string
  direction: 'up' | 'down'
}

export function computeCustomerKpis(customers: CustomerRow[], orders: OrderRow[]): CustomerKpi[] {
  const now = new Date()
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)

  const newThisMonth = customers.filter((c) => new Date(c.createdAt) >= startOfThisMonth).length
  const newLastMonth = customers.filter((c) => {
    const d = new Date(c.createdAt)
    return d >= startOfLastMonth && d < startOfThisMonth
  }).length
  const active = customers.filter((c) => c.status === 'active').length

  const paidOrders = orders.filter((o) => o.status !== 'cancelled')
  const avgOrderValue = paidOrders.length > 0 ? paidOrders.reduce((sum, o) => sum + o.totalRaw, 0) / paidOrders.length : 0

  const newDelta = pctDelta(newThisMonth, newLastMonth)

  return [
    { label: 'Total customers', value: `${customers.length}`, delta: '', ref: 'this month', direction: 'up' },
    { label: 'New this month', value: `${newThisMonth}`, delta: newDelta.delta, ref: 'vs last month', direction: newDelta.direction },
    { label: 'Active accounts', value: `${active}`, delta: '', ref: 'vs last month', direction: 'up' },
    { label: 'Avg. order value', value: formatMoney(Math.round(avgOrderValue)), delta: '', ref: 'vs last month', direction: 'up' },
  ]
}
