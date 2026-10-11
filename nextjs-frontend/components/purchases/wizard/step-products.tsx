"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Link2, PackagePlus, Repeat, Sparkles, X } from "lucide-react";

import type { UsualProduct } from "@/components/actions/purchasing-action";
import { LineEditor } from "@/components/purchases/wizard/line-editor";
import { SmartAdd } from "@/components/purchases/wizard/smart-add";
import { formatCurrency } from "@/lib/currency";
import { formatNumber } from "@/lib/format-number";
import { findBySku } from "@/lib/pos/catalog-search";
import { useBarcodeScanner } from "@/lib/pos/use-barcode-scanner";
import { draftWarnings } from "@/lib/purchases/checks";
import {
  findLineForProduct,
  lineFromProduct,
  newProductLine,
  type DraftAction,
  type PurchaseDraft,
  type PurchasingProduct,
} from "@/lib/purchases/draft";
import { typicalMarkup } from "@/lib/purchases/pricing";

const TIPS_KEY = "purchase-wizard-tips-dismissed";

interface StepProductsProps {
  draft: PurchaseDraft;
  dispatch: (action: DraftAction) => void;
  catalog: PurchasingProduct[];
  usual: UsualProduct[];
  /** Line to open when arriving from a review warning */
  focusLineKey: string | null;
}

export function StepProducts({ draft, dispatch, catalog, usual, focusLineKey }: StepProductsProps) {
  const t = useTranslations("purchases.wizard.products");
  const tLine = useTranslations("purchases.wizard.line");
  const addRef = useRef<HTMLInputElement>(null);
  const [activeKey, setActiveKey] = useState<string | null>(focusLineKey);
  const [showTips, setShowTips] = useState(false);

  useEffect(() => {
    setShowTips(localStorage.getItem(TIPS_KEY) !== "1");
    if (!focusLineKey) addRef.current?.focus();
  }, [focusLineKey]);

  const categories = useMemo(
    () => [...new Set(catalog.map((p) => p.category).filter((c): c is string => !!c))].sort(),
    [catalog],
  );
  const markup = useMemo(
    () =>
      typicalMarkup(
        catalog.map((p) => ({
          cost: p.last_unit_cost ? Number(p.last_unit_cost) : null,
          price: p.price ? Number(p.price) : null,
        })),
      ),
    [catalog],
  );
  const warningKeys = useMemo(
    () => new Set(draftWarnings(draft, catalog).flatMap((w) => ("lineKey" in w ? [w.lineKey] : []))),
    [draft, catalog],
  );

  function closeEditor() {
    setActiveKey(null);
    setTimeout(() => addRef.current?.focus(), 0);
  }

  function addProduct(product: PurchasingProduct, preset?: { quantity?: number | null; unitCost?: number | null }) {
    // Already in this purchase: open its line instead of adding a duplicate
    const existing = findLineForProduct(draft, product.id);
    if (existing) {
      setActiveKey(existing.key);
      return;
    }
    const line = lineFromProduct(product, preset);
    dispatch({ type: "addLine", line });
    setActiveKey(line.key);
  }

  function createProduct(name: string, sku = "") {
    const line = newProductLine(name, sku);
    dispatch({ type: "addLine", line });
    setActiveKey(line.key);
  }

  // A scanner works even when the cursor isn't in the search box
  useBarcodeScanner((code) => {
    const product = findBySku(catalog, code);
    if (product) addProduct(product);
    else createProduct("", code);
  }, activeKey == null);

  const usualVisible = usual.filter((u) => !draft.lines.some((l) => l.itemId === u.item_id));

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
        <p className="text-sm text-gray-500">{t("subtitle")}</p>
      </header>

      {showTips && (
        <div className="relative rounded-2xl border border-blue-100 bg-blue-50 p-4 pr-10 text-sm text-blue-950">
          <button
            type="button"
            onClick={() => {
              localStorage.setItem(TIPS_KEY, "1");
              setShowTips(false);
            }}
            className="absolute right-3 top-3 text-blue-400 hover:text-blue-700"
            aria-label={t("tipsDismiss")}
          >
            <X className="h-4 w-4" />
          </button>
          <p className="mb-2 font-semibold">{t("tipsTitle")}</p>
          <ul className="space-y-1.5">
            <li className="flex gap-2"><Link2 className="mt-0.5 h-4 w-4 shrink-0" />{t("tipLink")}</li>
            <li className="flex gap-2"><PackagePlus className="mt-0.5 h-4 w-4 shrink-0" />{t("tipCreate")}</li>
            <li className="flex gap-2"><Repeat className="mt-0.5 h-4 w-4 shrink-0" />{t("tipCheck")}</li>
          </ul>
        </div>
      )}

      <SmartAdd ref={addRef} catalog={catalog} onPick={(p) => addProduct(p)} onCreate={(name) => createProduct(name)} />

      {usualVisible.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
            {t("usualTitle", { supplier: draft.supplier?.name ?? "" })}
          </p>
          <div className="flex flex-wrap gap-2">
            {usualVisible.map((u) => {
              const product = catalog.find((p) => p.id === u.item_id);
              if (!product) return null;
              return (
                <button
                  key={u.item_id}
                  type="button"
                  onClick={() =>
                    addProduct(product, { quantity: Number(u.last_quantity), unitCost: Number(u.last_unit_cost) })
                  }
                  className="rounded-full border border-gray-200 bg-white px-3 py-2 text-sm hover:border-gray-900"
                >
                  <span className="font-medium text-gray-900">{u.name}</span>
                  <span className="ml-1.5 text-xs text-gray-500 tabular-nums">
                    {formatNumber(u.unit_type === "gram" ? Number(u.last_quantity) / 1000 : u.last_quantity, 3)}{" "}
                    <span className="rounded bg-amber-100 px-1 font-bold text-amber-900">
                      {u.unit_type === "gram" ? "kg" : tLine(`unitShort.${u.unit_type}`)}
                    </span>{" "}
                    · {formatCurrency(u.last_unit_cost)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {draft.lines.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-gray-700">{t("linesTitle", { count: draft.lines.length })}</p>
          <div className="inline-flex rounded-lg border bg-white p-0.5 text-xs font-medium" role="group" aria-label={t("costModeLabel")}>
            {(["unit", "line"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => dispatch({ type: "setCostMode", mode })}
                className={`rounded-md px-2.5 py-1.5 ${draft.costMode === mode ? "bg-gray-900 text-white" : "text-gray-600"}`}
              >
                {t(`costMode.${mode}`)}
              </button>
            ))}
          </div>
        </div>
      )}

      {draft.lines.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-gray-200 px-6 py-12 text-center">
          <Sparkles className="h-8 w-8 text-gray-300" />
          <p className="max-w-sm text-sm text-gray-600">{t.rich("empty", { b: (chunks) => <strong>{chunks}</strong> })}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {draft.lines.map((line) =>
            line.key === activeKey ? (
              <li key={line.key}>
                <LineEditor
                  line={line}
                  costMode={draft.costMode}
                  dispatch={dispatch}
                  catalog={catalog}
                  categories={categories}
                  markup={markup}
                  onDone={closeEditor}
                  onRemove={() => {
                    dispatch({ type: "removeLine", key: line.key });
                    closeEditor();
                  }}
                  onUseExisting={(product) => {
                    dispatch({ type: "removeLine", key: line.key });
                    addProduct(product, { quantity: line.quantity, unitCost: line.unitCost });
                  }}
                />
              </li>
            ) : (
              <li key={line.key}>
                <button
                  type="button"
                  onClick={() => setActiveKey(line.key)}
                  className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left transition hover:border-gray-400"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate font-medium text-gray-900">{line.name || tLine("unnamed")}</span>
                      {warningKeys.has(line.key) && <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />}
                    </span>
                    <span
                      className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        line.itemId ? "bg-blue-50 text-blue-800" : "bg-emerald-50 text-emerald-800"
                      }`}
                    >
                      {line.itemId
                        ? line.quantity && line.currentStock != null
                          ? tLine("linkedStock", {
                              added: formatNumber(line.unitType === "gram" ? line.quantity / 1000 : line.quantity, 3),
                              before: formatNumber(line.unitType === "gram" ? line.currentStock / 1000 : line.currentStock, 3),
                              after: formatNumber(
                                line.unitType === "gram"
                                  ? (line.currentStock + line.quantity) / 1000
                                  : line.currentStock + line.quantity,
                                3,
                              ),
                            })
                          : tLine("badgeLinked")
                        : tLine("badgeNew")}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="flex items-center justify-end gap-1 text-sm text-gray-600 tabular-nums">
                      {line.quantity ? (
                        <>
                          {formatNumber(line.unitType === "gram" ? line.quantity / 1000 : line.quantity, 3)}
                          <span className="rounded bg-amber-100 px-1.5 text-xs font-bold text-amber-900">
                            {line.unitType === "gram" ? "kg" : tLine(`unitShort.${line.unitType}`)}
                          </span>
                        </>
                      ) : (
                        <span className="text-red-600">{tLine("missingQuantity")}</span>
                      )}
                    </span>
                    <span className="block font-semibold text-gray-900 tabular-nums">
                      {line.lineTotal != null ? formatCurrency(line.lineTotal) : <span className="text-red-600">{tLine("missingCost")}</span>}
                    </span>
                  </span>
                </button>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}
