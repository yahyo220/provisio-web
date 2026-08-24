export type OrderStatus =
  | 'new'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'out'
  | 'delivered'
  | 'cancelled'

export type PaymentStatus = 'paid' | 'pending' | 'overdue'

export type StockStatus = 'in' | 'low' | 'out'

export interface OrderRow {
  /** Supabase row id (uuid) — used in routes, e.g. /orders/:id */
  id: string
  /** Human-friendly sequential number shown as "#4821" */
  orderNumber: number
  customerId: string | null
  customer: string
  meta: string
  /** Formatted for display, e.g. "Mar 22, 9:14 AM" */
  date: string
  /** Raw ISO timestamp — use this for sorting/filtering by recency. */
  createdAt: string
  total: string
  deliveryFee: number
  payment: PaymentStatus
  status: OrderStatus
  products?: string
}

export interface ProductRow {
  id: string
  name: string
  sku: string
  category: string
  price: string
  unit: string
  stock: StockStatus
  active: boolean
  updated: string
  image: string
}

export type CustomerStatus = 'active' | 'inactive'

export interface CustomerRow {
  id: string
  name: string
  type: string
  contact: string
  location: string
  orders: number
  spent: string
  status: CustomerStatus
  initials: string
}

export type DeliveryStatus = 'scheduled' | 'in-transit' | 'delayed' | 'delivered' | 'cancelled'

export interface DeliveryRow {
  id: string
  /** Display form, e.g. "#4821" */
  orderId: string
  /** Backing order row id (uuid) — use this to look the order up, not orderId. */
  orderDbId: string | null
  customer: string
  address: string
  driver: string
  eta: string
  status: DeliveryStatus
}
