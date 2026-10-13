"use client";

import { forwardRef } from "react";
import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/currency";
import { formatNumber } from "@/lib/format-number";
import { suggestCashAmounts } from "@/lib/pos/cash";
import { effectiveTendered } from "@/lib/pos/sale";

/** Cash: amount received (empty = exact), one-tap bills and the change, shown big. */
export const CashTender = forwardRef<
  HTMLInputElement,
  { total: number; tendered: string; onChange: (value: string) => void }
>(function CashTender({ total, tendered, onChange }, ref) {
  const t = useTranslations("sales.pos");
  const tenderedNum = parseFloat(tendered) || 0;
  const change = effectiveTendered(tendered, total) - total;

  return (
    <div className="space-y-2.5 animate-in fade-in slide-in-from-top-1">
      <label htmlFor="pos-tendered" className="text-[11px] text-gray-500 font-semibold uppercase tracking-widest">
        {t("amountTendered")}
      </label>
      <Input
        id="pos-tendered"
        ref={ref}
        type="number"
        inputMode="numeric"
        min={total ? total.toString() : "0"}
        step="1"
        value={tendered}
        onChange={(e) => onChange(e.target.value)}
        placeholder={formatNumber(total)}
        className="h-14 rounded-xl border-gray-200 text-2xl font-bold font-mono tabular-nums"
      />
      <div className="grid grid-cols-4 gap-1.5">
        {suggestCashAmounts(total).map((amount, i) => (
          <button
            key={amount}
            type="button"
            onClick={() => {
              onChange(i === 0 ? "" : String(amount));
              if (ref && typeof ref !== "function") ref.current?.focus();
            }}
            className={`h-10 rounded-xl border text-xs font-semibold tabular-nums transition-colors ${
              (i === 0 ? tendered.trim() === "" : tenderedNum === amount)
                ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {i === 0 ? t("exactAmount") : formatNumber(amount)}
          </button>
        ))}
      </div>
      <div
        className={`flex items-baseline justify-between rounded-xl px-4 py-3 ${
          change < 0 ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700"
        }`}
      >
        <span className="text-sm font-semibold">{t("changeDue")}</span>
        <span className="text-2xl font-black tabular-nums">
          {formatCurrency(Math.max(0, change))}
        </span>
      </div>
    </div>
  );
});
