"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";

import { formatCurrency } from "@/lib/currency";
import { formatNumber } from "@/lib/format-number";
import {
  productWarnings,
  type CatalogProduct,
  type ProductDraft,
  type ProductStep,
  type ProductWarning,
} from "@/lib/products/draft";

/** Step 4: the product as it will look, each row with a way back to its step. */
export function StepReview({
  draft,
  catalog,
  goTo,
}: {
  draft: ProductDraft;
  catalog: CatalogProduct[];
  goTo: (step: ProductStep) => void;
}) {
  const t = useTranslations("addItem.wizard.review");
  const tUnits = useTranslations("addItem.wizard.price.units");
  const tStockUnits = useTranslations("addItem.wizard.stock.units");
  const tDash = useTranslations("dashboard");
  const warnings = productWarnings(draft, catalog);
  const stockUnit = tStockUnits(draft.unit);
  const perUnit = draft.unit === "gram" ? "/kg" : draft.unit === "liter" ? "/L" : "";

  function warningText(w: ProductWarning) {
    return w.type === "similarName" ? t("warnings.similarName", { existing: w.existing }) : t("warnings.noPrice");
  }

  const rows: { label: string; value: string; step: ProductStep; muted?: boolean }[] = [
    { label: t("code"), value: draft.sku.trim() || t("noCode"), step: "product", muted: !draft.sku.trim() },
    { label: t("category"), value: draft.category.trim() || t("noCategory"), step: "product", muted: !draft.category.trim() },
    ...(draft.description.trim() ? [{ label: t("description"), value: draft.description.trim(), step: "product" as const }] : []),
    {
      label: t("price"),
      value: draft.price ? `${formatCurrency(draft.price)}${perUnit} · ${tUnits(draft.unit)}` : t("noPriceShort"),
      step: "price",
      muted: !draft.price,
    },
    { label: t("stock"), value: `${formatNumber(draft.stock ?? 0, 3)} ${stockUnit}`, step: "stock" },
    ...(draft.minStock != null
      ? [{ label: t("min"), value: `${formatNumber(draft.minStock, 3)} ${stockUnit}`, step: "stock" as const }]
      : []),
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
        <p className="text-sm text-gray-500">{t("subtitle")}</p>
      </header>

      {warnings.length > 0 && (
        <ul className="space-y-1.5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          {warnings.map((w) => (
            <li key={w.type} className="flex items-start gap-2 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="flex-1">{warningText(w)}</span>
              <button
                type="button"
                onClick={() => goTo(w.type === "noPrice" ? "price" : "product")}
                className="rounded-md border border-amber-300 bg-white px-2 py-0.5 text-xs font-medium hover:bg-amber-100"
              >
                {t("change")}
              </button>
            </li>
          ))}
        </ul>
      )}

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        {/* Same look as the product tile at the register */}
        <div className="flex items-stretch border-b">
          <div className="flex w-20 shrink-0 items-center justify-center bg-gray-100">
            <span className="text-lg font-black uppercase tracking-wide text-gray-500">
              {tDash(`unitAbbr.${draft.unit}`)}
            </span>
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="truncate text-lg font-bold text-gray-900">{draft.name.trim()}</p>
              <button
                type="button"
                onClick={() => goTo("product")}
                className="text-xs font-medium text-blue-700 hover:underline"
              >
                {t("change")}
              </button>
            </div>
            <span className={`shrink-0 text-xl font-bold tabular-nums ${draft.price ? "text-green-700" : "text-gray-400"}`}>
              {draft.price ? `${formatCurrency(draft.price)}${perUnit}` : t("noPriceShort")}
            </span>
          </div>
        </div>
        <dl className="divide-y">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center gap-3 px-4 py-3 text-sm">
              <dt className="w-32 shrink-0 text-gray-500">{row.label}</dt>
              <dd className={`min-w-0 flex-1 truncate ${row.muted ? "text-gray-400" : "font-medium text-gray-900"}`}>
                {row.value}
              </dd>
              <button
                type="button"
                onClick={() => goTo(row.step)}
                className="shrink-0 text-xs font-medium text-blue-700 hover:underline"
              >
                {t("change")}
              </button>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
