"use client";

import { useTranslations } from "next-intl";
import { Box, Info, Package, Scale, Droplet } from "lucide-react";

import { NumberField } from "@/components/purchases/wizard/number-field";
import { currencySymbol } from "@/lib/currency";
import { PRODUCT_UNITS, canSkipPrice, type ProductDraft, type ProductUnit } from "@/lib/products/draft";

const UNIT_ICONS: Record<ProductUnit, React.ElementType> = {
  unit: Box,
  gram: Scale,
  liter: Droplet,
  pack: Package,
};

/** Step 2: sold by unit / weight / liter / pack, and the sell price. */
export function StepPrice({ draft, set }: { draft: ProductDraft; set: (patch: Partial<ProductDraft>) => void }) {
  const t = useTranslations("addItem.wizard.price");

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
        <p className="text-sm text-gray-500">{t("subtitle")}</p>
      </header>

      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-700">{t("unit")}</p>
        <div role="radiogroup" aria-label={t("unit")} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {PRODUCT_UNITS.map((unit) => {
            const Icon = UNIT_ICONS[unit];
            const active = draft.unit === unit;
            return (
              <button
                key={unit}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  set({ unit });
                  document.getElementById("np-price")?.focus();
                }}
                className={`flex flex-col items-start gap-2 rounded-2xl border-2 p-4 text-left transition ${
                  active ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white hover:border-gray-400"
                }`}
              >
                <Icon className="h-6 w-6" />
                <span className="text-base font-semibold">{t(`units.${unit}`)}</span>
                <span className={`text-xs leading-snug ${active ? "text-gray-300" : "text-gray-500"}`}>
                  {t(`unitHints.${unit}`)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-w-sm space-y-1.5">
        <label htmlFor="np-price" className="text-sm font-medium text-gray-700">
          {t(`priceLabel.${draft.unit}`)}
        </label>
        <NumberField
          id="np-price"
          autoFocus
          prefix={currencySymbol}
          value={draft.price}
          onValueChange={(price) => set({ price })}
          className="h-14 text-xl"
        />
        {canSkipPrice(draft) && (
          <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            {t("noPrice")}
          </p>
        )}
      </div>
    </div>
  );
}
