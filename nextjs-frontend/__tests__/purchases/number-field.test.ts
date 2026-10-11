import { formatLocaleNumber, formatWhileTyping, parseLocaleNumber } from "@/components/purchases/wizard/number-field";

describe("number field formatting (dots for thousands, comma for decimals)", () => {
  it("adds thousands dots while typing", () => {
    expect(formatWhileTyping("204000", 0)).toBe("204.000");
    expect(formatWhileTyping("1234567", 0)).toBe("1.234.567");
    expect(formatWhileTyping("204.0001", 0)).toBe("2.040.001");
  });

  it("keeps decimals in progress for kg", () => {
    expect(formatWhileTyping("2,", 3)).toBe("2,");
    expect(formatWhileTyping("2,5", 3)).toBe("2,5");
    expect(formatWhileTyping("1500,255", 3)).toBe("1.500,255");
    expect(formatWhileTyping("2,5555", 3)).toBe("2,555");
  });

  it("turns the keypad dot into a decimal comma when decimals are allowed", () => {
    expect(formatWhileTyping("2.", 3)).toBe("2,");
    // deleting a digit from "1.500" keeps it a thousands separator
    expect(formatWhileTyping("1.50", 3)).toBe("150");
    // but not for whole-number amounts
    expect(formatWhileTyping("2.", 0)).toBe("2");
  });

  it("parses back to numbers", () => {
    expect(parseLocaleNumber("1.234.567,5")).toBe(1234567.5);
    expect(parseLocaleNumber("204.000")).toBe(204000);
    expect(parseLocaleNumber("")).toBeNull();
  });

  it("formats stored values", () => {
    expect(formatLocaleNumber(204000, 0)).toBe("204.000");
    expect(formatLocaleNumber(2.5, 3)).toBe("2,5");
    expect(formatLocaleNumber(null, 0)).toBe("");
  });
});
