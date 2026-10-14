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
  /** The number people see: this company's own count (№1, №2… per company,
   * migration 0062). Two companies can both have a №5 — show it with
   * companyName (see orderLabel). */
  orderNumber: number
  /** orders.order_number — system-wide, unique; internal use only. */
  globalNumber: number
  /** The company the order belongs to (its company root): company_name, or
   * the root account's name. */
  companyName: string
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
  /** `total` (which is before VAT) with 12% VAT added — what the customer
   * pays and what invoices and the app show. Formatted. */
  totalWithVat: string
  deliveryFee: number
  payment: PaymentStatus
  status: OrderStatus
  products?: string
  /** The delivery time the shopper picked at checkout ("Завтра, 09:00 – 10:00")
   * — empty for orders placed before migration 0059 or on the website. */
  deliverySlot?: string
  /** orders.delivery_address — where the shopper asked to deliver. */
  deliveryAddress?: string
  /** orders.payment_method — 'cash' | 'transfer' ('card' on very old orders). */
  paymentMethod?: string
  /** 'telegram' for orders taken by the Telegram bot; '' from the app. */
  source?: string
  /** orders.notes — e.g. lines the Telegram bot couldn't recognise. */
  notes?: string
}

/** One order_items row, joined just enough for stats math (category
 * breakdown, top products) — see lib/stats.ts. */
export interface OrderItemRow {
  orderId: string
  productId: string | null
  /** order_items.name / unit — what was ordered, as stored on the line. */
  name: string
  unit: string
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
  /** Raw products.updated_at (ISO) — for sorting and the product page's date. */
  updatedAt: string
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
  /** The username this person signs in to the app with (blank if none set). */
  login: string
  /** The courier new orders from this client (and its linked staff) are
   * assigned to automatically — see migration 0057. Null: assign by hand. */
  defaultDriverId: string | null
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
  /** Set when 5 failed sign-in attempts locked the account (see
   * migrations 0044/0060) — null means not locked. The lock expires on its
   * own after 15 minutes, so use isLoginLocked() (lib/loginLock.ts), not this alone. */
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
  /** drivers.id of the assigned courier — null while unassigned. */
  driverId: string | null
  eta: string
  status: DeliveryStatus
  /** Raw ISO timestamp — for stats math (see lib/stats.ts). */
  createdAt: string
}
