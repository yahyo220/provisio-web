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
  /** Same amount as `total`, unformatted — for stats math (see lib/stats.ts). */
  totalRaw: number
  deliveryFee: number
  payment: PaymentStatus
  status: OrderStatus
  products?: string
}

/** One order_items row, joined just enough for stats math (category
 * breakdown, top products) — see lib/stats.ts. */
export interface OrderItemRow {
  orderId: string
  productId: string | null
  qty: number
  unitPrice: number
}

/** Price (and optional external price) for one of a product's non-primary
 * units — see ProductRow.unitPrices. Formatted display strings, same
 * convention as ProductRow.price/priceExternal ('' = not set). */
export interface UnitPriceRow {
  unit: string
  price: string
  priceExternal: string
}

export interface ProductRow {
  id: string
  name: string
  sku: string
  category: string
  price: string
  /** Optional wholesale/external price shown only to 'external' price_tier customers. Empty string = not set. */
  priceExternal: string
  unit: string
  /** Up to 3 units this product can be ordered in (e.g. кг/пучок/шт). Empty = just `unit`. */
  units: string[]
  /** Price override for units[1:] — units[0] always uses price/priceExternal above. */
  unitPrices: UnitPriceRow[]
  /** Short trade-copy blurb shown on the app's product detail screen. Empty = the app falls back to its own generic templated description. */
  description: string
  /** Per-language overrides for `name` — null/empty falls back to the Russian
   * `name` above (see migration 0026_product_name_translations.sql). Edited
   * via the language-switch button next to the Product Name field. */
  nameUzCyrl: string
  nameUzLatn: string
  nameEn: string
  /** Same idea, for `description` (migration 0032_product_description_translations.sql). */
  descriptionUzCyrl: string
  descriptionUzLatn: string
  descriptionEn: string
  /** Other products that are really "this same product, different variety"
   * (e.g. three tomato types) — admin-linked, not automatic. Null/shared
   * with no one = no variant picker shown in the app. */
  variantGroupId: string | null
  stock: StockStatus
  active: boolean
  updated: string
  image: string
}

export type CustomerStatus = 'active' | 'inactive'

/** Onboarding gate for self-registered app users: 'pending' can browse but
 * not order, until an admin sets this to 'approved'. */
export type ApprovalStatus = 'pending' | 'approved' | 'suspended'

/** Which price a customer's app sees: their normal price, no price at all
 * (order first, find out the price later), or the external/wholesale price. */
export type PriceTier = 'with_price' | 'no_price' | 'external'

export interface CustomerRow {
  id: string
  name: string
  type: string
  contact: string
  phone: string
  email: string
  location: string
  orders: number
  spent: string
  status: CustomerStatus
  initials: string
  approvalStatus: ApprovalStatus
  priceTier: PriceTier
  hasLogin: boolean
  /** One of the app registration screen's fixed choices — "Повар", "Бармен",
   * "Руководитель" — or blank for a login created some other way (e.g. the
   * website's own "add customer login"). Informational except as a hint for
   * what price_tier to grant: only "Руководитель" normally sees prices. */
  staffRole: string
  /** Business name typed at registration (e.g. a cafe/restaurant name) — separate
   * from `name`, which is the account/contact display name. Used on накладная exports. */
  companyName: string
  /** Set when this login was linked to another client (see migration 0047)
   * instead of standing as its own — several staff at the same business each
   * register their own login, and an admin links the later ones here so
   * only one shows up as a top-level client on this page. Null for either a
   * standalone client or the client staff are linked *to*. */
  parentCustomerId: string | null
  /** "Перечисление" (bank transfer) as a checkout payment method — off by
   * default; a customer requests it in the app, an admin grants it here. */
  bankTransferEnabled: boolean
  bankTransferRequested: boolean
  /** "Наличными курьеру" (cash on delivery) as a checkout payment method —
   * same request/grant gate as bank transfer above. Cards aren't accepted at
   * all, so a customer can't place any order until an admin grants at least
   * one of these two. */
  cashEnabled: boolean
  cashRequested: boolean
  /** Set once 3 failed sign-in attempts locked the account (see
   * migration 0044_login_attempt_lockout.sql) — null means not locked.
   * Only an admin can clear it; a customer can never unlock themselves. */
  loginLockedAt: string | null
  /** Raw ISO timestamp — for stats math (see lib/stats.ts), same idea as OrderRow.createdAt. */
  createdAt: string
}

export type DeliveryStatus = 'scheduled' | 'in-transit' | 'delayed' | 'delivered' | 'cancelled'

export interface DriverRow {
  id: string
  name: string
  phone: string
  active: boolean
  hasLogin: boolean
  loginLockedAt: string | null
}

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
  /** Raw ISO timestamp — for stats math (see lib/stats.ts). */
  createdAt: string
}
