import { dateInputToIso, toDateInputValue } from "@/lib/dates";

// Run under Paraguay's timezone (see jest TZ in the test script below)
describe("purchase dates in local time", () => {
  it("formats the local day, not the UTC day", () => {
    // 22:30 local on Oct 11 is already Oct 12 in UTC
    expect(toDateInputValue(new Date(2026, 9, 11, 22, 30))).toBe("2026-10-11");
  });

  it("round-trips a picked day without shifting it", () => {
    const now = new Date(2026, 9, 20, 9, 0);
    for (const day of ["2026-10-11", "2026-01-01", "2026-12-31"]) {
      const iso = dateInputToIso(day, now)!;
      expect(toDateInputValue(new Date(iso))).toBe(day);
    }
  });

  it("keeps the current time for today", () => {
    const now = new Date(2026, 9, 11, 16, 45);
    expect(dateInputToIso("2026-10-11", now)).toBe(now.toISOString());
  });

  it("rejects malformed values", () => {
    expect(dateInputToIso("11/10/2026")).toBeUndefined();
  });
});
