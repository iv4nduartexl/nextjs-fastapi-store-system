export function formatNumber(
  value: number | string | null | undefined,
  decimals = 0,
): string {
  if (value == null || value === "") return "";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "";
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}
