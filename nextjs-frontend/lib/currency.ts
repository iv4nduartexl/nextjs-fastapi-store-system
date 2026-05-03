const symbol = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL ?? "₲";
const decimals = parseInt(process.env.NEXT_PUBLIC_CURRENCY_DECIMALS ?? "0", 10);

export function formatCurrency(
  amount: number | string | null | undefined,
  decimalsOverride?: number,
): string {
  if (amount == null) return "—";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "—";
  const fractionDigits = decimalsOverride ?? decimals;
  return `${symbol}${num.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  })}`;
}

export { symbol as currencySymbol, decimals as currencyDecimals };
