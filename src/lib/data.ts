import type { CustomerRow, DeliveryRow, OrderRow, ProductRow } from './types'

/**
 * Demo/example content has been cleared out — this file now defines the shape
 * every screen expects, with empty/zeroed values. Wire it up to the real
 * backend (see the API layer once it exists) instead of re-seeding mock rows.
 */

export const productImages = {}

const PLACEHOLDER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
  '<rect width="100" height="100" fill="#F0E5DF"/>' +
  '<path d="M28 68 L44 42 L56 56 L70 40 L82 68 Z" fill="#C9BBAF"/>' +
  '<circle cx="36" cy="34" r="6" fill="#C9BBAF"/>' +
  '</svg>'

/** Neutral "no photo yet" placeholder — used until a real image is uploaded. */
export const placeholderImage = `data:image/svg+xml;utf8,${encodeURIComponent(PLACEHOLDER_SVG)}`

/** Fixed unit vocabulary offered when adding/editing a product — a product
 * can be tagged with up to 3 of these (see ProductRow.units). */
export const PRODUCT_UNITS = ['kg', 'gram', 'box', 'piece', 'bottle', 'bunch', 'package']

/** Category vocabulary offered when adding/editing a product. The keys here
 * are the actual `products.category` values stored in the database — add
 * the matching Russian label in i18n/translations.ts's CATEGORY_RU whenever
 * a category is added here, or it'll just show the raw English key in the
 * Russian UI. */
export const PRODUCT_CATEGORIES = [
  'Vegetables',
  'Fruits',
  'Dairy',
  'Meat',
  'Seafood',
  'Eggs',
  'Bread',
  'Bakery / Confectionery',
  'Herbs',
  'Spices',
  'Oil',
  'Nuts',
  'Legumes & Cereals',
  'Grains & Pasta',
  'Sauces & Condiments',
  'Sweets & Snacks',
  'Honey & Preserves',
  'Pickles & Marinades',
  'Canned Goods',
  'Frozen',
  'Semi-finished Products',
  'Beverages',
  'Tea & Coffee',
  'Groceries',
  'Cleaning',
  'Kitchen Supplies / Disposables',
  'Packaging & Disposables',
  'Kitchen Equipment',
]

/** SKU letter prefix per category, always Latin letters regardless of UI
 * language (per client request: SKUs should be sortable/distinguishable at a
 * glance, e.g. "F-0001" for the 1st fruit ever added). One letter where a
 * category's initial doesn't collide with any other category's initial;
 * two letters (a memorable pair, not just "first two letters") where it does
 * collide or the name has more than two words. Keep this in sync with
 * PRODUCT_CATEGORIES — every entry needs a unique code here. */
export const CATEGORY_SKU_PREFIX: Record<string, string> = {
  Vegetables: 'V',
  Fruits: 'F',
  Dairy: 'D',
  Meat: 'M',
  Seafood: 'SE',
  Eggs: 'E',
  Bread: 'BR',
  'Bakery / Confectionery': 'BC',
  Herbs: 'HB',
  Spices: 'SP',
  Oil: 'O',
  Nuts: 'N',
  'Legumes & Cereals': 'LC',
  'Grains & Pasta': 'GP',
  'Sauces & Condiments': 'SC',
  'Sweets & Snacks': 'SW',
  'Honey & Preserves': 'HP',
  'Pickles & Marinades': 'PM',
  'Canned Goods': 'CG',
  Frozen: 'FZ',
  'Semi-finished Products': 'SF',
  Beverages: 'BV',
  'Tea & Coffee': 'TC',
  Groceries: 'GR',
  Cleaning: 'CL',
  'Kitchen Supplies / Disposables': 'KS',
  'Packaging & Disposables': 'PD',
  'Kitchen Equipment': 'KE',
}

/** Fallback for a category that somehow isn't in the map above (shouldn't
 * happen since every PRODUCT_CATEGORIES entry has one) — first letter of
 * the category name, uppercased. */
function fallbackSkuPrefix(category: string): string {
  return (category.trim()[0] || 'X').toUpperCase()
}

/** Suggests the next SKU for a new product in `category`, given the products
 * that already exist. Looks at existing SKUs under this category's prefix
 * and continues the sequence from the highest number found — rather than
 * just counting current products — so deleting a product never causes the
 * next suggestion to reuse a SKU that's already been used (and possibly
 * printed on a label, referenced in an old order, etc). */
export function suggestNextSku(category: string, existingProducts: { sku: string }[]): string {
  const prefix = CATEGORY_SKU_PREFIX[category] ?? fallbackSkuPrefix(category)
  const pattern = new RegExp(`^${prefix}-(\\d+)$`, 'i')
  let maxN = 0
  for (const p of existingProducts) {
    const match = pattern.exec(p.sku.trim())
    if (match) maxN = Math.max(maxN, Number(match[1]))
  }
  const next = String(maxN + 1).padStart(4, '0')
  return `${prefix}-${next}`
}

export const kpis = [
  { label: "Today's revenue", value: '0 сум', delta: '0%', ref: 'vs yesterday', direction: 'up' as const, icon: 'package' as const },
  { label: "Today's orders", value: '0', delta: '0%', ref: 'vs yesterday', direction: 'up' as const, icon: 'box' as const },
  { label: 'Pending orders', value: '0', delta: '0', ref: 'since noon', direction: 'up' as const, icon: 'alert' as const },
  { label: 'In delivery', value: '0', delta: '0', ref: 'since noon', direction: 'up' as const, icon: 'package' as const },
  { label: 'Completed today', value: '0', delta: '0%', ref: 'vs yesterday', direction: 'up' as const, icon: 'box' as const },
  { label: 'Total customers', value: '0', delta: '0', ref: 'this month', direction: 'up' as const, icon: 'package' as const },
]

export type RevenueRange = '1W' | '1M' | '3M' | '1Y'

export const categoryBreakdownByRange: Record<RevenueRange, { name: string; pct: number }[]> = {
  '1W': [],
  '1M': [],
  '3M': [],
  '1Y': [],
}

const EMPTY_CHART = { stat: '0 сум', points: '0,219 640,219', axis: ['', '', '', '', '', '', '', ''] }

export const revenueByRange: Record<
  RevenueRange,
  { stat: string; periodKey: string; points: string; axis: string[] }
> = {
  '1W': { ...EMPTY_CHART, periodKey: 'last7days' },
  '1M': { ...EMPTY_CHART, periodKey: 'last30days' },
  '3M': { ...EMPTY_CHART, periodKey: 'last3months' },
  '1Y': { ...EMPTY_CHART, periodKey: 'last12months' },
}

export const topProductsByRange: Record<
  RevenueRange,
  { id: string; name: string; category: string; price: string; unit: string; units: string; image: string }[]
> = {
  '1W': [],
  '1M': [],
  '3M': [],
  '1Y': [],
}

/** Single source of truth for every order — Dashboard "Recent orders" is just the newest N of this list. */
export const orders: OrderRow[] = []

export const products: ProductRow[] = []

export interface OrderLineItem {
  /** Supabase order_items row id (uuid) — absent for the (now empty) local mock rows. */
  id?: string
  name: string
  sku: string
  qty: number
  unit: string
  unitPrice: number
  image: string
  /** The product's category, looked up via product_id — used by the Excel export. Empty if the product was deleted since. */
  category: string
}

export const defaultOrderLineItems: OrderLineItem[] = []

export const deliveryFee = 0

export const orderTimeline: { titleKey: string; time: string; done: boolean }[] = []

export const relatedOrders: { id: string; meta: string; amount: string; icon: 'package' | 'package-x' }[] = []

/* ---------------------------------- Customers ---------------------------------- */

export const customerKpis = [
  { label: 'Total customers', value: '0', delta: '0', ref: 'this month', direction: 'up' as const },
  { label: 'New this month', value: '0', delta: '0', ref: 'vs last month', direction: 'up' as const },
  { label: 'Active accounts', value: '0', delta: '0', ref: 'vs last month', direction: 'up' as const },
  { label: 'Avg. order value', value: '0 сум', delta: '0%', ref: 'vs last month', direction: 'up' as const },
]

export const customers: CustomerRow[] = []

/* ---------------------------------- Deliveries ---------------------------------- */

export const deliveryKpis = [
  { label: "Today's deliveries", value: '0', delta: '0', ref: 'vs yesterday', direction: 'up' as const },
  { label: 'In transit', value: '0', delta: '0', ref: 'since noon', direction: 'up' as const },
  { label: 'Delayed', value: '0', delta: '0', ref: 'since noon', direction: 'up' as const },
  { label: 'Completed today', value: '0', delta: '0%', ref: 'vs yesterday', direction: 'up' as const },
]

export const drivers: string[] = []

export const deliveries: DeliveryRow[] = []

/* ---------------------------------- Analytics ---------------------------------- */

const EMPTY_ANALYTICS_KPIS = [
  { label: 'Total revenue', value: '0 сум', delta: '0%', ref: 'vs last month', direction: 'up' as const },
  { label: 'Total orders', value: '0', delta: '0%', ref: 'vs last month', direction: 'up' as const },
  { label: 'Avg. order value', value: '0 сум', delta: '0%', ref: 'vs last month', direction: 'up' as const },
  { label: 'Repeat customer rate', value: '0%', delta: '0%', ref: 'vs last month', direction: 'up' as const },
]

export const analyticsKpisByRange: Record<RevenueRange, typeof EMPTY_ANALYTICS_KPIS> = {
  '1W': EMPTY_ANALYTICS_KPIS,
  '1M': EMPTY_ANALYTICS_KPIS,
  '3M': EMPTY_ANALYTICS_KPIS,
  '1Y': EMPTY_ANALYTICS_KPIS,
}

export const paymentBreakdown: { name: string; pct: number }[] = []

export const topCustomersBySpend: { name: string; meta: string; value: string }[] = []

const EMPTY_PRODUCT_PERFORMANCE: {
  name: string
  unitsSold: string
  revenue: string
  growth: string
  direction: 'up' | 'down'
}[] = []

export const productPerformanceByRange: Record<RevenueRange, typeof EMPTY_PRODUCT_PERFORMANCE> = {
  '1W': EMPTY_PRODUCT_PERFORMANCE,
  '1M': EMPTY_PRODUCT_PERFORMANCE,
  '3M': EMPTY_PRODUCT_PERFORMANCE,
  '1Y': EMPTY_PRODUCT_PERFORMANCE,
}
