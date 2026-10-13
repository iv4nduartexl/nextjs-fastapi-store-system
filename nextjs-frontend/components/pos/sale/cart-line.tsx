"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { DollarSign, Minus, Plus, X } from "lucide-react";

import { formatCurrency } from "@/lib/currency";
import { quantityStep, type CartItem, type LinePricing } from "@/lib/pos/pricing";

/** One cart row: name, price badges, −/qty/+, line total (opens the price editor), round, remove. */
export function CartLine({
  item,
  pricing,
  flash,
  rounded,
  onQuantity,
  onEditPrice,
  onRound,
  onRemove,
}: {
  item: CartItem;
  pricing: LinePricing;
  /** Just added: briefly highlighted */
  flash: boolean;
  /** The price comes from the round-to-500 button (pressing it again undoes it) */
  rounded: boolean;
  onQuantity: (quantity: number) => void;
  onEditPrice: () => void;
  onRound: () => void;
  onRemove: () => void;
}) {
  const t = useTranslations("sales.pos");
  const tDash = useTranslations("dashboard");
  // Full name on tap (touch screens have no hover)
  const [expanded, setExpanded] = useState(false);
  const step = quantityStep(item.unitType);
  const perKg = item.unitType === "gram" ? "/kg" : "";

  return (
    <div
      className={`rounded-xl border px-3 py-2.5 transition-colors duration-500 ${
        flash ? "border-green-300 bg-green-50" : "border-gray-100 bg-white"
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p
            title={item.name}
            onClick={() => setExpanded((v) => !v)}
            className={`text-sm font-medium text-gray-800 leading-tight break-words cursor-pointer ${expanded ? "" : "line-clamp-2"}`}
          >
            {item.name}
          </p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {pricing.pricingSource !== "base" && (
              <span className="text-xs text-gray-400 line-through tabular-nums">
                {formatCurrency(pricing.baseUnitPrice)}
                {perKg}
              </span>
            )}
            <span
              className={`text-xs tabular-nums ${pricing.pricingSource === "base" ? "text-gray-500" : "text-green-700 font-semibold"}`}
            >
              {formatCurrency(pricing.effectiveUnitPrice)}
              {perKg}
            </span>
            <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-1 py-0.5 rounded leading-none">
              {tDash(`unitAbbr.${item.unitType}`)}
            </span>
            {pricing.pricingSource === "manual_override" && (
              <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-1 py-0.5 rounded leading-none">
                {t("manualPrice")}
              </span>
            )}
            {pricing.pricingSource === "quantity_discount" && pricing.discountRuleName && (
              <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1 py-0.5 rounded leading-none">
                {t("discountApplied")}: {pricing.discountRuleName}
              </span>
            )}
          </div>
        </div>

        {/* Line total: tap to change the price */}
        <button
          onClick={onEditPrice}
          title={t("editLinePrice")}
          className="shrink-0 rounded-md px-1 text-sm font-semibold text-gray-900 tabular-nums hover:bg-blue-50 hover:text-blue-700 transition-colors"
        >
          {formatCurrency(pricing.effectiveSubtotal)}
        </button>
      </div>

      <div className="mt-2 flex items-center gap-1">
        <button
          onClick={() => onQuantity(item.quantity - step)}
          className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center transition-colors"
        >
          <Minus size={12} />
        </button>
        <input
          type="number"
          value={String(item.quantity)}
          min={1}
          step={step}
          onChange={(e) => onQuantity(parseFloat(e.target.value))}
          onBlur={() => {
            if (!item.quantity) onQuantity(1);
          }}
          className="w-16 text-center text-xs border border-gray-200 rounded-lg py-1 font-mono bg-white"
        />
        <button
          onClick={() => onQuantity(item.quantity + step)}
          className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center transition-colors"
        >
          <Plus size={12} />
        </button>

        <div className="ml-auto flex items-center gap-0.5">
          <button
            onClick={onRound}
            title={t("roundPrice")}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
              rounded
                ? "text-blue-600 bg-blue-50 hover:bg-blue-100"
                : "text-gray-300 hover:text-blue-500 hover:bg-blue-50"
            }`}
          >
            <DollarSign size={14} />
          </button>
          <button
            onClick={onRemove}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
