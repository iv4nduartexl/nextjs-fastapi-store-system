"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, Loader2, PackagePlus, X } from "lucide-react";

import { quickCreateItem, type QuickCreateItem } from "@/components/actions/pos-action";
import { NumberField } from "@/components/purchases/wizard/number-field";
import { Button } from "@/components/ui/button";
import { currencySymbol, formatCurrency } from "@/lib/currency";
import type { PosProduct } from "@/lib/pos/catalog-search";
import { quickCreatePrefill } from "@/lib/pos/quick-create";
import { findSimilarProduct } from "@/lib/purchases/checks";

type Unit = QuickCreateItem["unit_type"];
const UNITS: Unit[] = ["unit", "gram", "liter", "pack"];

interface QuickCreateProductProps {
  /** What was searched or scanned */
  initialText: string;
  catalog: PosProduct[];
  categories: string[];
  onClose: () => void;
  /** Called with the new product, or an existing one the user picked instead */
  onReady: (product: PosProduct) => void;
}

/** "Este producto no existe": create it in a few seconds and keep selling. */
export function QuickCreateProduct({ initialText, catalog, categories, onClose, onReady }: QuickCreateProductProps) {
  const t = useTranslations("sales.pos.quickCreate");
  const prefill = useMemo(() => quickCreatePrefill(initialText), [initialText]);
  const [name, setName] = useState(prefill.name);
  const [price, setPrice] = useState<number | null>(null);
  const [unit, setUnit] = useState<Unit>("unit");
  const [sku, setSku] = useState(prefill.sku);
  const [more, setMore] = useState(false);
  const [category, setCategory] = useState("");
  const [stock, setStock] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<PosProduct | null>(null);

  const similar = useMemo(() => (name.trim() ? findSimilarProduct(name, catalog) : undefined), [name, catalog]);
  const reason = !name.trim() ? t("errors.name") : !price || price <= 0 ? t("errors.price") : null;

  async function submit() {
    if (reason || submitting || price == null) return;
    setSubmitting(true);
    setError(null);
    const result = await quickCreateItem({
      name: name.trim(),
      price,
      unit_type: unit,
      sku: sku.trim() || undefined,
      category: category.trim() || undefined,
      // Weighed products keep stock in grams; the field asks for kg
      stock: stock != null ? (unit === "gram" ? stock * 1000 : stock) : undefined,
    });
    setSubmitting(false);
    if (result.data) onReady(result.data);
    else if (result.existing) setExisting(result.existing);
    else setError(t("errors.generic"));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
        className="mx-4 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between border-b px-5 py-4">
          <div className="flex items-center gap-2">
            <PackagePlus className="h-5 w-5 text-green-600" />
            <div>
              <h3 className="font-semibold text-gray-900">{t("title")}</h3>
              <p className="text-xs text-gray-500">{t("subtitle")}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label={t("close")}>
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          {existing && (
            <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
              <p className="text-amber-900">{t("codeExists", { code: sku.trim(), name: existing.name })}</p>
              <Button type="button" size="sm" onClick={() => onReady(existing)} className="bg-green-600 hover:bg-green-700">
                {t("addExisting", { name: existing.name })}
              </Button>
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="qc-name" className="text-sm font-medium text-gray-700">
              {t("name")} <span className="text-red-500">*</span>
            </label>
            <input
              id="qc-name"
              autoFocus={!!prefill.name || !prefill.sku}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("namePlaceholder")}
              className="h-11 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:ring-2 focus:ring-gray-900/10"
            />
            {similar && !existing && (
              <p className="flex flex-wrap items-center gap-1.5 text-xs text-amber-800">
                {t("similar", { name: similar.name })}
                <button type="button" onClick={() => onReady(similar)} className="font-semibold underline">
                  {t("useThis")}
                </button>
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-medium text-gray-700">{t("unit")}</p>
            <div className="grid grid-cols-4 gap-2">
              {UNITS.map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnit(u)}
                  className={`h-10 rounded-lg border text-sm font-medium ${
                    unit === u ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white hover:bg-gray-50"
                  }`}
                >
                  {t(`units.${u}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="qc-price" className="text-sm font-medium text-gray-700">
              {t(`priceLabel.${unit}`)} <span className="text-red-500">*</span>
            </label>
            <NumberField
              id="qc-price"
              autoFocus={!prefill.name && !!prefill.sku}
              prefix={currencySymbol}
              value={price}
              onValueChange={setPrice}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="qc-sku" className="text-sm font-medium text-gray-700">
              {t("code")} <span className="font-normal text-gray-400">({t("optional")})</span>
            </label>
            <input
              id="qc-sku"
              value={sku}
              onChange={(e) => {
                setSku(e.target.value);
                setExisting(null);
              }}
              className="h-11 w-full rounded-lg border border-gray-200 px-3 font-mono text-sm outline-none focus:ring-2 focus:ring-gray-900/10"
            />
          </div>

          <button
            type="button"
            onClick={() => setMore((v) => !v)}
            className="flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-800"
          >
            <ChevronDown className={`h-4 w-4 transition ${more ? "rotate-180" : ""}`} /> {t("moreOptions")}
          </button>
          {more && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="qc-category" className="text-sm font-medium text-gray-700">
                  {t("category")}
                </label>
                <input
                  id="qc-category"
                  list="qc-categories"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="h-11 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:ring-2 focus:ring-gray-900/10"
                />
                <datalist id="qc-categories">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="qc-stock" className="text-sm font-medium text-gray-700">
                  {t("stock")}
                </label>
                <NumberField
                  id="qc-stock"
                  value={stock}
                  onValueChange={setStock}
                  decimals={unit === "gram" || unit === "liter" ? 3 : 0}
                  unit={t(`stockUnit.${unit}`)}
                />
              </div>
            </div>
          )}

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

          <div className="flex items-center justify-end gap-3 pt-1">
            {reason && <p className="min-w-0 flex-1 text-xs text-gray-500">{reason}</p>}
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={!!reason || submitting} className="bg-green-600 hover:bg-green-700">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {price ? t("createAndAddPrice", { price: formatCurrency(price) }) : t("createAndAdd")}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
