// The order products are listed in on every printed sheet and Excel file:
// by category (fruits, vegetables, greens, then the rest of the catalog's
// own category order), and alphabetically inside each category — so the
// warehouse can pick a list from top to bottom.
import { PRODUCT_CATEGORIES } from './data'

const FIRST = ['Fruits', 'Vegetables', 'Herbs']
const ORDER = [...FIRST, ...PRODUCT_CATEGORIES.filter((c) => !FIRST.includes(c))]
const RANK = new Map(ORDER.map((c, i) => [c, i]))

/** Position of a category in the document order; unknown ones go last. */
export function categoryRank(category: string | null | undefined): number {
  return RANK.get(category ?? '') ?? ORDER.length
}

/** A sorted copy of [items] in catalog order. */
export function byCatalog<T>(items: readonly T[], category: (item: T) => string | null | undefined, name: (item: T) => string): T[] {
  return [...items].sort((a, b) => categoryRank(category(a)) - categoryRank(category(b)) || name(a).localeCompare(name(b), 'ru'))
}
