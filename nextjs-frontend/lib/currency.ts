const symbol = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL ?? "₲";
const decimals = parseInt(process.env.NEXT_PUBLIC_CURRENCY_DECIMALS ?? "0", 10);

export function formatCurrency(
  amount: number | string | null | undefined,
): string {
  if (amount == null) return "—";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "—";
  return `${symbol}${num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: 2,
  })}`;
}

export { symbol as currencySymbol, decimals as currencyDecimals };
