// Calendar dates from <input type="date"> are local days. Going through UTC (new Date("2026-10-11"),
// toISOString().slice(0, 10)) shifts them a day for anyone west of UTC, e.g. Paraguay.

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Local calendar day as "YYYY-MM-DD" (the value format of <input type="date">). */
export function toDateInputValue(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * ISO timestamp for a picked day: today keeps the current time, other days use local noon,
 * so the day never changes when shown in any nearby timezone.
 */
export function dateInputToIso(value: string, now: Date = new Date()): string | undefined {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return undefined;
  if (value === toDateInputValue(now)) return now.toISOString();
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d), 12, 0, 0).toISOString();
}

/** "2026-10-05" → "05/10/2026" in the given locale, without timezone shifts. */
export function formatDateInputValue(value: string, locale: string): string {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" });
}
