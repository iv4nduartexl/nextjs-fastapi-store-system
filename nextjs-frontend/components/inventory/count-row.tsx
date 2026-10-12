"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Equal, X } from "lucide-react";

import { NumberField } from "@/components/purchases/wizard/number-field";
import { formatNumber } from "@/lib/format-number";
import {
  difference,
  displayDecimals,
  fromDisplay,
  toDisplay,
  type CountEntry,
} from "@/lib/inventory/count";
import type { PosProduct } from "@/lib/pos/catalog-search";

/** Column layout shared by the rows and their header. */
export const COUNT_GRID = "grid grid-cols-[minmax(0,1fr)_5.5rem_auto_4.5rem] items-center gap-3 sm:grid-cols-[minmax(0,1fr)_7rem_auto_5rem]";

export function CountHeader({ removable }: { removable?: boolean }) {
  const t = useTranslations("inventory.count");
  return (
    <div className={`${COUNT_GRID} border-b bg-gray-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500`}>
      <span>{t("columns.product")}</span>
      <span className="text-right">{t("columns.system")}</span>
      <span className={removable ? "pr-10" : ""}>{t("columns.counted")}</span>
      <span className="text-right">{t("columns.difference")}</span>
    </div>
  );
}

interface CountRowProps {
  product: PosProduct;
  entry: CountEntry | undefined;
  highlighted?: boolean;
  /** Save the counted amount (only on Enter or the ✓ button, never while typing) */
  onSet: (counted: number | null) => void;
  /** After saving with Enter: done with this product */
  onDone?: () => void;
  /** Shown in review: take the product out of the count */
  onRemove?: () => void;
}

/** One product: what the system has now, what was counted, and the difference. */
export const CountRow = forwardRef<HTMLInputElement, CountRowProps>(function CountRow(
  { product, entry, highlighted, onSet, onDone, onRemove },
  ref,
) {
  const t = useTranslations("inventory.count");
  const unitType = product.unit_type;
  const unitLabel = t(`unit.${unitType}`);
  const decimals = displayDecimals(unitType);
  const stock = parseFloat(product.stock) || 0;
  const system = toDisplay(stock, unitType);
  const saved = entry ? toDisplay(entry.counted, unitType) : null;

  // What's typed stays local until it's saved, so "12" isn't counted as "1" on the first key
  const [typed, setTyped] = useState<number | null>(saved);
  useEffect(() => setTyped(saved), [saved]);
  const pending = typed != null && typed !== saved;
  // Live while typing (against the current stock, which is what saving uses), else the saved difference
  const diff = pending
    ? Math.round((typed - system) * 1000) / 1000
    : entry
      ? toDisplay(difference(entry), unitType)
      : null;

  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

  function save(done: boolean) {
    if (typed == null) return;
    if (pending) onSet(fromDisplay(typed, unitType));
    if (done) onDone?.();
  }

  return (
    <li className={`${COUNT_GRID} px-4 py-2.5 transition-colors ${highlighted ? "bg-green-50" : "bg-white"}`}>
      <div className="min-w-0">
        <p className="truncate font-medium text-gray-900" title={product.name}>
          {product.name}
        </p>
        <p className="truncate text-xs text-gray-400">
          {[product.category, product.sku].filter(Boolean).join(" · ") || " "}
        </p>
      </div>

      {/* Current system stock, easy to read at a glance */}
      <p className="text-right tabular-nums">
        <span className={`text-lg font-bold ${stock > 0 ? "text-gray-900" : "text-gray-400"}`}>
          {formatNumber(system, decimals)}
        </span>{" "}
        <span className="text-xs text-gray-500">{unitLabel}</span>
      </p>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          // Only fills the field; Enter or ✓ saves it
          onClick={() => {
            setTyped(system);
            setTimeout(() => {
              inputRef.current?.focus();
              inputRef.current?.select();
            }, 0);
          }}
          className="flex h-10 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
          aria-label={t("sameAsSystem")}
          title={t("sameAsSystem")}
        >
          <Equal className="h-4 w-4" />
        </button>
        <NumberField
          ref={inputRef}
          value={typed}
          onValueChange={setTyped}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save(true);
            } else if (e.key === "Escape") {
              setTyped(saved);
            }
          }}
          decimals={decimals}
          unit={unitLabel}
          placeholder={t("countedPlaceholder")}
          aria-label={t("countedFor", { name: product.name })}
          className={`w-28 sm:w-32 ${pending ? "border-amber-400 ring-2 ring-amber-200" : ""}`}
        />
        <button
          type="button"
          onClick={() => save(false)}
          disabled={!pending}
          className={`flex h-10 w-9 items-center justify-center rounded-lg ${
            pending ? "bg-green-600 text-white hover:bg-green-700" : "text-gray-300"
          }`}
          aria-label={t("save")}
          title={t("save")}
        >
          <Check className="h-4 w-4" />
        </button>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="flex h-10 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
            aria-label={t("discard", { name: product.name })}
            title={t("discard", { name: product.name })}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <span
        title={pending ? t("unsavedDifference") : undefined}
        className={`text-right text-sm font-semibold tabular-nums ${pending ? "italic " : ""}${
          diff == null ? "text-gray-300" : diff > 0 ? "text-green-600" : diff < 0 ? "text-red-600" : "text-gray-400"
        }`}
      >
        {diff == null ? "—" : diff === 0 ? "✓" : `${diff > 0 ? "+" : ""}${formatNumber(diff, decimals)}`}
      </span>
    </li>
  );
});
