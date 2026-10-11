// Quick "amount received" suggestions for cash payments.

const ROUNDING_STEPS = [1000, 5000, 10000, 50000, 100000];

/**
 * The exact total plus the next round amounts a customer typically hands over
 * (e.g. 39.000 → 39.000, 40.000, 50.000, 100.000). Up to `max` values, ascending.
 */
export function suggestCashAmounts(total: number, max = 4): number[] {
  if (!(total > 0)) return [];
  const amounts = new Set<number>([total]);
  for (const step of ROUNDING_STEPS) {
    const rounded = Math.ceil(total / step) * step;
    if (rounded > total) amounts.add(rounded);
  }
  return [...amounts].sort((a, b) => a - b).slice(0, max);
}
