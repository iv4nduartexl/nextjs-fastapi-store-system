// Dots for thousands and comma for decimals (1.234.567,5), the same in every browser and on the server
export const NUMBER_LOCALE = process.env.NEXT_PUBLIC_NUMBER_LOCALE ?? "es-PY";

export function formatNumber(
  value: number | string | null | undefined,
  decimals = 0,
): string {
  if (value == null || value === "") return "";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "";
  return num.toLocaleString(NUMBER_LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}
