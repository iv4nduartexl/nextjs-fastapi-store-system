"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, ChevronDown, ScanBarcode } from "lucide-react";

import { CategoryCombobox } from "@/components/ui/category-combobox";
import { Link } from "@/i18n/routing";
import { skuOwner, type CatalogProduct, type ProductDraft } from "@/lib/products/draft";
import { findSimilarProduct } from "@/lib/purchases/checks";

const FIELD =
  "h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-base outline-none focus:ring-2 focus:ring-gray-900/10";

/** Step 1: barcode, name, category (description tucked away). */
export function StepIdentity({
  draft,
  set,
  catalog,
}: {
  draft: ProductDraft;
  set: (patch: Partial<ProductDraft>) => void;
  catalog: CatalogProduct[];
}) {
  const t = useTranslations("addItem.wizard.product");
  const [more, setMore] = useState(!!draft.description);
  const owner = skuOwner(draft, catalog);
  const similar = draft.name.trim() ? findSimilarProduct(draft.name, catalog) : undefined;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
        <p className="text-sm text-gray-500">{t("subtitle")}</p>
      </header>

      <div className="space-y-1.5">
        <label htmlFor="np-sku" className="text-sm font-medium text-gray-700">
          {t("sku")}
        </label>
        <div className="relative">
          <ScanBarcode className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            id="np-sku"
            autoFocus={!draft.sku && !draft.name}
            autoComplete="off"
            value={draft.sku}
            onChange={(e) => set({ sku: e.target.value })}
            onKeyDown={(e) => {
              // A scanner ends with Enter: jump to the name instead of leaving the step
              if (e.key === "Enter" && !draft.name.trim()) {
                e.preventDefault();
                document.getElementById("np-name")?.focus();
              }
            }}
            placeholder={t("skuPlaceholder")}
            className={`${FIELD} pl-10 font-mono ${owner ? "border-amber-300 bg-amber-50/40" : ""}`}
          />
        </div>
        <p className="text-xs text-gray-500">{t("skuHint")}</p>
        {owner && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 animate-in fade-in slide-in-from-top-1">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="flex-1">{t("skuTaken", { name: owner.name })}</span>
            <Link
              href={`/products?q=${encodeURIComponent(draft.sku.trim())}`}
              className="rounded-md bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-700"
            >
              {t("editExisting")}
            </Link>
            <button
              type="button"
              onClick={() => {
                set({ sku: "" });
                document.getElementById("np-sku")?.focus();
              }}
              className="rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold hover:bg-amber-100"
            >
              {t("useOtherCode")}
            </button>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="np-name" className="text-sm font-medium text-gray-700">
          {t("name")} <span className="text-red-500">*</span>
        </label>
        <input
          id="np-name"
          autoFocus={!!draft.sku && !draft.name}
          autoComplete="off"
          value={draft.name}
          onChange={(e) => set({ name: e.target.value })}
          onBlur={() => {
            // "coca cola" → "Coca cola"
            const name = draft.name.trim();
            if (name) set({ name: name.charAt(0).toUpperCase() + name.slice(1) });
          }}
          placeholder={t("namePlaceholder")}
          className={FIELD}
        />
        {similar && <p className="text-xs text-amber-800">{t("similar", { name: similar.name })}</p>}
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-gray-700">
          {t("category")}
        </label>
        <CategoryCombobox
          name="category"
          value={draft.category}
          onChange={(category) => set({ category })}
          placeholder={t("categoryPlaceholder")}
          inputClassName="h-11 text-base"
        />
      </div>

      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setMore((v) => !v)}
          className="flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-800"
        >
          <ChevronDown className={`h-4 w-4 transition ${more ? "rotate-180" : ""}`} /> {t("moreDetails")}
        </button>
        {more && (
          <div className="space-y-1.5">
            <label htmlFor="np-description" className="text-sm font-medium text-gray-700">
              {t("description")}
            </label>
            <textarea
              id="np-description"
              rows={2}
              value={draft.description}
              onChange={(e) => set({ description: e.target.value })}
              placeholder={t("descriptionPlaceholder")}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900/10"
            />
          </div>
        )}
      </div>
    </div>
  );
}
