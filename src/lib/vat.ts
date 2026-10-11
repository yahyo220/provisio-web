// 12% VAT, added on top of the line sum. The same rate lives in the app
// (CartController.kVatRate) and in the database (order_total_with_vat,
// migration 0060) — keep all three in sync if it ever changes.
export const VAT_RATE = 0.12

/** The VAT on a pre-VAT amount, rounded to whole sums like every invoice. */
export function vatOf(net: number): number {
  return Math.round(net * VAT_RATE)
}

/** A pre-VAT amount with its VAT added — what the customer actually pays. */
export function withVat(net: number): number {
  return net + vatOf(net)
}
