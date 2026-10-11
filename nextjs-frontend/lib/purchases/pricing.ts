// Margins and sell-price suggestions for the purchase wizard.

/** Gross margin as a fraction of the sell price (0.41 = 41%), or null when it can't be computed. */
export function margin(cost: number | null, price: number | null): number | null {
  if (cost == null || price == null || price <= 0) return null;
  return (price - cost) / price;
}

/** Round up to a "nice" price for the currency (₲ has no decimals: nearest 100). */
export function roundPrice(value: number, step = 100): number {
  return Math.ceil(value / step) * step;
}

/**
 * When the new cost would lower the margin, the sell price that keeps the previous markup.
 * Returns null when the margin doesn't drop (no suggestion needed).
 */
export function suggestPriceForCost(
  newCost: number | null,
  previousCost: number | null,
  currentPrice: number | null,
): number | null {
  if (!newCost || !previousCost || !currentPrice) return null;
  const before = margin(previousCost, currentPrice);
  const after = margin(newCost, currentPrice);
  if (before == null || after == null || after >= before - 0.005) return null;
  const suggested = roundPrice((currentPrice / previousCost) * newCost);
  return suggested > currentPrice ? suggested : null;
}

/** The store's usual markup (price ÷ cost), the median over products that have both. */
export function typicalMarkup(pairs: { cost: number | null; price: number | null }[]): number | null {
  const ratios = pairs
    .filter((p) => p.cost && p.price && p.cost > 0 && p.price > p.cost)
    .map((p) => p.price! / p.cost!)
    .sort((a, b) => a - b);
  if (ratios.length === 0) return null;
  const mid = Math.floor(ratios.length / 2);
  return ratios.length % 2 ? ratios[mid] : (ratios[mid - 1] + ratios[mid]) / 2;
}

/** Suggested sell price for a new product given its cost. */
export function suggestPriceForNewProduct(cost: number | null, markup: number | null): number | null {
  if (!cost || !markup) return null;
  return roundPrice(cost * markup);
}
