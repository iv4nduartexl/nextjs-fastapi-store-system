"use client";

import { useTranslations } from "next-intl";

import { NumberField } from "@/components/purchases/wizard/number-field";
import { formatNumber } from "@/lib/format-number";
import type { ProductDraft } from "@/lib/products/draft";

const QUICK_AMOUNTS = [0, 6, 12, 24];

/** Step 3: current stock and the low-stock warning, in kg / L / units as people count them. */
export function StepStock({ draft, set }: { draft: ProductDraft; set: (patch: Partial<ProductDraft>) => void }) {
  const t = useTranslations("addItem.wizard.stock");
  const unit = t(`units.${draft.unit}`);
  const decimals = draft.unit === "gram" || draft.unit === "liter" ? 3 : 0;
  const countable = draft.unit === "unit" || draft.unit === "pack";

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
        <p className="text-sm text-gray-500">{t("subtitle")}</p>
      </header>

      <div className="max-w-sm space-y-1.5">
        <label htmlFor="np-stock" className="text-sm font-medium text-gray-700">
          {t("current")}
        </label>
        <NumberField
          id="np-stock"
          autoFocus
          value={draft.stock}
          onValueChange={(stock) => set({ stock })}
          decimals={decimals}
          unit={unit}
          placeholder="0"
          className="h-14 text-xl"
        />
        {countable && (
          <div className="flex gap-2 pt-1">
            {QUICK_AMOUNTS.map((amount) => (
              <button
                key={amount}
                type="button"
                onClick={() => set({ stock: amount })}
                className={`h-9 min-w-12 rounded-lg border px-3 text-sm font-semibold tabular-nums ${
                  (draft.stock ?? 0) === amount
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {formatNumber(amount)}
              </button>
            ))}
          </div>
        )}
        <p className="text-xs text-gray-500">{t("hint")}</p>
      </div>

      <div className="max-w-sm space-y-1.5 border-t pt-6">
        <label htmlFor="np-min" className="text-sm font-medium text-gray-700">
          {t("min")}
        </label>
        <NumberField
          id="np-min"
          value={draft.minStock}
          onValueChange={(minStock) => set({ minStock })}
          decimals={decimals}
          unit={unit}
        />
        <p className="text-xs text-gray-500">{t("minHint")}</p>
      </div>
    </div>
  );
}
