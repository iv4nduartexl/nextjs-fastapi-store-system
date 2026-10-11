"use client";

import { forwardRef, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link2, Plus, ScanBarcode, Search } from "lucide-react";

import { formatCurrency } from "@/lib/currency";
import { formatNumber } from "@/lib/format-number";
import { findBySku, searchCatalog } from "@/lib/pos/catalog-search";
import type { PurchasingProduct } from "@/lib/purchases/draft";

interface SmartAddProps {
  catalog: PurchasingProduct[];
  onPick: (product: PurchasingProduct) => void;
  onCreate: (name: string, sku?: string) => void;
}

const MAX_RESULTS = 6;

/**
 * One box to add products. The dropdown always shows two labelled groups:
 * existing products ("adds to stock") and "create a new product", so both options are obvious.
 */
export const SmartAdd = forwardRef<HTMLInputElement, SmartAddProps>(function SmartAdd(
  { catalog, onPick, onCreate },
  ref,
) {
  const t = useTranslations("purchases.wizard.products");
  const tDash = useTranslations("dashboard");
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);

  const results = useMemo(() => searchCatalog(catalog, query, MAX_RESULTS), [catalog, query]);
  const term = query.trim();
  // Options: the results, then "create" (always last)
  const optionCount = term ? results.length + 1 : 0;

  function pick(index: number) {
    if (index < results.length) onPick(results[index]);
    else if (term) onCreate(term);
    setQuery("");
    setHighlighted(0);
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
      <input
        ref={ref}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlighted(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            if (!optionCount) return;
            e.preventDefault();
            setHighlighted((i) => (e.key === "ArrowDown" ? Math.min(i + 1, optionCount - 1) : Math.max(i - 1, 0)));
          } else if (e.key === "Enter" && term) {
            e.preventDefault();
            // A scanned/typed barcode goes straight to its product
            const byCode = findBySku(catalog, term);
            if (byCode) {
              onPick(byCode);
              setQuery("");
              return;
            }
            pick(highlighted);
          } else if (e.key === "Escape") {
            setQuery("");
          }
        }}
        placeholder={t("addPlaceholder")}
        aria-label={t("addPlaceholder")}
        className="h-14 w-full rounded-2xl border-2 border-gray-200 bg-white pl-12 pr-12 text-base shadow-sm outline-none transition focus:border-gray-900"
      />
      <ScanBarcode className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-300" />

      {term && (
        <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border bg-white shadow-xl">
          {results.length > 0 && (
            <>
              <p className="flex items-center gap-1.5 bg-gray-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                <Link2 className="h-3.5 w-3.5" />
                {t("groupCatalog")}
              </p>
              {results.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  onMouseEnter={() => setHighlighted(i)}
                  onClick={() => pick(i)}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left ${i === highlighted ? "bg-gray-100" : ""}`}
                >
                  <span className="flex h-9 min-w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 px-1.5 text-[11px] font-black uppercase text-amber-900">
                    {p.unit_type === "gram" ? "kg" : tDash(`unitAbbr.${p.unit_type}`)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-gray-900">{p.name}</span>
                    <span className="block text-xs text-gray-500">
                      {t("stockShort", { stock: formatNumber(p.stock, 3) })}
                      {p.last_unit_cost && <> · {t("lastCostShort", { cost: formatCurrency(p.last_unit_cost) })}</>}
                    </span>
                  </span>
                </button>
              ))}
            </>
          )}
          <button
            type="button"
            onMouseEnter={() => setHighlighted(results.length)}
            onClick={() => pick(results.length)}
            className={`flex w-full items-center gap-3 border-t px-4 py-3 text-left ${
              highlighted === results.length ? "bg-emerald-50" : "bg-white"
            }`}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <Plus className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-emerald-700">{t("groupCreate")}</span>
              <span className="block font-medium text-gray-900">«{term}»</span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
});
