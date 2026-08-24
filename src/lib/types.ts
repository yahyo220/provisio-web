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
  id: string
  customer: string
  meta: string
  date: string
  total: string
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
  orderId: string
  customer: string
  address: string
  driver: string
  eta: string
  status: DeliveryStatus
}
