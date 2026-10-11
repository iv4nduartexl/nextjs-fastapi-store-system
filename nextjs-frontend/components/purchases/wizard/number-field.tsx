"use client";

import { forwardRef, useEffect, useState } from "react";

import { NUMBER_LOCALE } from "@/lib/format-number";
import { cn } from "@/lib/utils";

/** "1.234.567,5" → 1234567.5 (dots are thousands, comma is decimal). */
export function parseLocaleNumber(text: string): number | null {
  const cleaned = text.replace(/[\s.]/g, "").replace(",", ".");
  if (cleaned === "" || cleaned === ".") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** 1234567.5 → "1.234.567,5" */
export function formatLocaleNumber(value: number | null, decimals: number): string {
  if (value == null) return "";
  return value.toLocaleString(NUMBER_LOCALE, { maximumFractionDigits: decimals, useGrouping: true });
}

/** Re-formats what the user is typing, keeping a trailing comma or decimals in progress. */
export function formatWhileTyping(raw: string, decimals: number): string {
  let text = raw.replace(/[^\d.,]/g, "");
  // A "." just typed (numeric keypad) means decimal when decimals are allowed and there's no comma yet.
  // Dots elsewhere are thousands separators, e.g. after deleting a digit from "1.500".
  if (decimals > 0 && !text.includes(",") && text.endsWith(".")) {
    const at = text.lastIndexOf(".");
    text = `${text.slice(0, at)},${text.slice(at + 1)}`;
  }
  const [intPart, ...rest] = text.split(",");
  const digits = intPart.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  const formattedInt = digits ? Number(digits).toLocaleString(NUMBER_LOCALE, { useGrouping: true }) : "";
  if (decimals === 0 || rest.length === 0) return formattedInt;
  const dec = rest.join("").replace(/\D/g, "").slice(0, decimals);
  return `${formattedInt || "0"},${dec}`;
}

interface NumberFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  value: number | null;
  onValueChange: (value: number | null) => void;
  /** Allowed decimals (0 for ₲ amounts, 3 for kg) */
  decimals?: number;
  /** Shown inside the field on the left (e.g. ₲) */
  prefix?: string;
  /** Unit shown as a highlighted badge on the right (e.g. kg, u., L) */
  unit?: string;
  invalid?: boolean;
}

/** Numeric input with thousands separators as you type: "204.000", "2,5". */
export const NumberField = forwardRef<HTMLInputElement, NumberFieldProps>(function NumberField(
  { value, onValueChange, decimals = 0, prefix, unit, invalid, className, onBlur, ...props },
  ref,
) {
  const [text, setText] = useState(formatLocaleNumber(value, decimals));

  // Follow external changes (e.g. the other cost field being recalculated)
  useEffect(() => {
    if (parseLocaleNumber(text) !== value) setText(formatLocaleNumber(value, decimals));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div
      className={cn(
        "flex h-11 items-center rounded-lg border bg-white px-3 focus-within:ring-2 focus-within:ring-gray-900/10",
        invalid ? "border-red-300 bg-red-50/40" : "border-gray-200",
        className,
      )}
    >
      {prefix && <span className="mr-1.5 text-sm text-gray-400">{prefix}</span>}
      <input
        ref={ref}
        inputMode={decimals > 0 ? "decimal" : "numeric"}
        autoComplete="off"
        value={text}
        onChange={(e) => {
          const formatted = formatWhileTyping(e.target.value, decimals);
          setText(formatted);
          onValueChange(parseLocaleNumber(formatted));
        }}
        onBlur={(e) => {
          setText(formatLocaleNumber(parseLocaleNumber(text), decimals));
          onBlur?.(e);
        }}
        className="w-full min-w-0 bg-transparent text-base font-medium tabular-nums outline-none"
        {...props}
      />
      {unit && (
        <span className="ml-2 shrink-0 rounded-md bg-amber-100 px-2 py-0.5 text-sm font-bold text-amber-900">{unit}</span>
      )}
    </div>
  );
});
