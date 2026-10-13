"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, ArrowLeftRight, Check, ChevronDown, Lightbulb, Trash2 } from "lucide-react";

import { NumberField } from "@/components/purchases/wizard/number-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { currencySymbol, formatCurrency } from "@/lib/currency";
import { formatNumber } from "@/lib/format-number";
import { findSimilarProduct } from "@/lib/purchases/checks";
import type { DraftAction, DraftLine, PurchasingProduct, UnitType } from "@/lib/purchases/draft";
import { margin, suggestPriceForCost, suggestPriceForNewProduct } from "@/lib/purchases/pricing";

const UNIT_TYPES: UnitType[] = ["unit", "gram", "liter", "pack"];

interface LineEditorProps {
  line: DraftLine;
  dispatch: (action: DraftAction) => void;
  catalog: PurchasingProduct[];
  categories: string[];
  markup: number | null;
  onDone: () => void;
  onRemove: () => void;
  onUseExisting: (product: PurchasingProduct) => void;
}

/** Highlighted unit, so nobody mixes up grams, kg and units. */
function UnitBadge({ children }: { children: React.ReactNode }) {
  return <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-900">{children}</span>;
}

/** Editing one line. Enter = "Listo" (or jumps to the next missing field). */
export function LineEditor({
  line,
  dispatch,
  catalog,
  categories,
  markup,
  onDone,
  onRemove,
  onUseExisting,
}: LineEditorProps) {
  const t = useTranslations("purchases.wizard.line");
  const isNew = line.itemId == null;
  const isWeight = line.unitType === "gram";
  const containerRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const costRef = useRef<HTMLInputElement>(null);
  const totalRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [editingPrice, setEditingPrice] = useState(isNew);
  const [moreOpen, setMoreOpen] = useState(false);

  // Bring the editor into view (the list can be long)
  useEffect(() => {
    containerRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, []);

  const update = (patch: Partial<DraftLine>, changed?: "quantity" | "unitCost" | "lineTotal") =>
    dispatch({ type: "updateLine", key: line.key, patch, changed });
  const touch = (field: string) => setTouched((prev) => ({ ...prev, [field]: true }));

  const similar = isNew ? findSimilarProduct(line.name, catalog) : undefined;
  // Weighed products are entered and priced per kg
  const qtyUnit = isWeight ? "kg" : t(`unitShort.${line.unitType}`);

  const priceSuggestion = isNew
    ? suggestPriceForNewProduct(line.unitCost, markup)
    : suggestPriceForCost(line.unitCost, line.lastUnitCost, line.currentPrice);
  const lineMargin = margin(line.unitCost, line.sellPrice);

  const missing = {
    name: isNew && !line.name.trim(),
    quantity: !(line.quantity && line.quantity > 0),
    cost: line.lineTotal == null || line.lineTotal < 0,
    price: isNew && !(line.sellPrice && line.sellPrice > 0),
  };
  const show = (field: keyof typeof missing) => touched[field] && missing[field];

  /** Enter: finish the line, or take the user to the first thing still missing. */
  function finish() {
    const order: [keyof typeof missing, React.RefObject<HTMLInputElement | null>][] = [
      ["name", nameRef],
      ["quantity", qtyRef],
      // The cost field the user works with on this line
      ["cost", line.costSource === "line" ? totalRef : costRef],
      ["price", priceRef],
    ];
    const firstMissing = order.find(([field]) => missing[field]);
    if (firstMissing) {
      const [field, ref] = firstMissing;
      touch(field);
      if (field === "price") setEditingPrice(true);
      setTimeout(() => ref.current?.focus(), 0);
      return;
    }
    onDone();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      finish();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onDone();
    }
  }

  return (
    <div
      ref={containerRef}
      onKeyDown={onKeyDown}
      className="scroll-mb-40 space-y-3 rounded-2xl border-2 border-gray-900 bg-white p-4 shadow-lg"
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
            isNew ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"
          }`}
        >
          {isNew ? t("badgeNew") : t("badgeLinked")}
        </span>
        <button type="button" onClick={onRemove} className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label={t("remove")}>
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {isNew ? (
        <>
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700" htmlFor={`name-${line.key}`}>
              {t("name")} <span className="text-red-500">*</span>
            </label>
            <Input
              id={`name-${line.key}`}
              ref={nameRef}
              value={line.name}
              autoFocus={!line.name}
              onChange={(e) => update({ name: e.target.value })}
              onBlur={() => touch("name")}
              className={`h-11 text-base ${show("name") ? "border-red-300" : ""}`}
            />
            {show("name") && <p className="text-xs text-red-600">{t("errors.name")}</p>}
            {similar && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <Lightbulb className="h-4 w-4 shrink-0" />
                <span>{t("didYouMean", { name: similar.name })}</span>
                <button
                  type="button"
                  onClick={() => onUseExisting(similar)}
                  className="rounded-md bg-amber-900 px-2 py-1 text-xs font-semibold text-white hover:bg-amber-800"
                >
                  {t("useExisting")}
                </button>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <p className="text-sm font-medium text-gray-700">{t("howSold")}</p>
            <div className="grid grid-cols-4 gap-1.5">
              {UNIT_TYPES.map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => update({ unitType: u, quantity: null, lineTotal: null })}
                  className={`h-10 rounded-lg border px-2 text-sm font-semibold transition ${
                    line.unitType === u ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  {t(`unitType.${u}`)}
                </button>
              ))}
            </div>
            {/* Only the selected option's explanation, to keep the screen short */}
            <p className="text-xs text-gray-500">{t(`unitHint.${line.unitType}`)}</p>
          </div>
        </>
      ) : (
        <div>
          <p className="text-lg font-semibold text-gray-900">{line.name}</p>
          {line.currentStock != null && (
            <p className="flex flex-wrap items-center gap-1 text-sm text-gray-500">
              {t("stockNow", {
                stock: formatNumber(isWeight ? line.currentStock / 1000 : line.currentStock, 3),
              })}
              <UnitBadge>{qtyUnit}</UnitBadge>
              {line.lastUnitCost != null && <span>· {t("lastCost", { cost: formatCurrency(line.lastUnitCost, 2) })}</span>}
            </p>
          )}
        </div>
      )}

      <div className="space-y-1 sm:max-w-[calc(50%-1.5rem)]">
        <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700" htmlFor={`qty-${line.key}`}>
          {t("quantity")} <UnitBadge>{t("in", { unit: qtyUnit })}</UnitBadge>
          <span className="text-red-500">*</span>
        </label>
        <NumberField
          id={`qty-${line.key}`}
          ref={qtyRef}
          autoFocus={!isNew || !!line.name}
          decimals={isWeight || line.unitType === "liter" ? 3 : 2}
          // Weighed products are entered in kg; stored in grams
          value={line.quantity == null ? null : isWeight ? line.quantity / 1000 : line.quantity}
          onValueChange={(v) => update({ quantity: v == null ? null : isWeight ? Math.round(v * 1000) : v }, "quantity")}
          unit={qtyUnit}
          invalid={show("quantity")}
          onBlur={() => touch("quantity")}
        />
        {show("quantity") && <p className="text-xs text-red-600">{t("errors.quantity")}</p>}
      </div>

      {/* Cost per unit and line total: type whichever the invoice shows, the other is calculated */}
      <div className="space-y-1">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2">
          <div className="space-y-1">
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700" htmlFor={`cost-${line.key}`}>
              {t("cost")} <UnitBadge>{t("per", { unit: qtyUnit })}</UnitBadge>
              <span className="text-red-500">*</span>
            </label>
            <NumberField
              id={`cost-${line.key}`}
              ref={costRef}
              prefix={currencySymbol}
              decimals={2}
              value={line.unitCost}
              onValueChange={(v) => update({ unitCost: v }, "unitCost")}
              invalid={show("cost")}
              onBlur={() => touch("cost")}
              className={line.costSource === "line" ? "bg-gray-50" : ""}
            />
            {line.costSource === "line" && line.unitCost != null && (
              <p className="text-xs text-gray-400">{t("calculated")}</p>
            )}
          </div>
          <ArrowLeftRight className="mt-9 h-4 w-4 text-gray-300" aria-hidden />
          <div className="space-y-1">
            <label className="flex items-center text-sm font-medium text-gray-700" htmlFor={`total-${line.key}`}>
              {t("total")}
            </label>
            <NumberField
              id={`total-${line.key}`}
              ref={totalRef}
              prefix={currencySymbol}
              decimals={2}
              value={line.lineTotal}
              onValueChange={(v) => update({ lineTotal: v }, "lineTotal")}
              invalid={show("cost")}
              onBlur={() => touch("cost")}
              className={line.costSource !== "line" ? "bg-gray-50" : ""}
            />
            {line.costSource !== "line" && line.lineTotal != null && (
              <p className="text-xs text-gray-400">{t("calculated")}</p>
            )}
          </div>
        </div>
        {show("cost") && <p className="text-xs text-red-600">{t("errors.cost")}</p>}
      </div>

      {/* Sell price: shown for existing products, required for new ones */}
      <div className="space-y-1.5 rounded-xl bg-gray-50 p-3">
        {editingPrice ? (
          <>
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700" htmlFor={`price-${line.key}`}>
              {t("sellPrice")} <UnitBadge>{t("per", { unit: qtyUnit })}</UnitBadge>
              {isNew && <span className="text-red-500">*</span>}
            </label>
            <NumberField
              id={`price-${line.key}`}
              ref={priceRef}
              prefix={currencySymbol}
              value={line.sellPrice}
              onValueChange={(v) => update({ sellPrice: v })}
              invalid={show("price")}
              onBlur={() => touch("price")}
            />
            {show("price") && <p className="text-xs text-red-600">{t("errors.price")}</p>}
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex flex-wrap items-center gap-1 text-sm text-gray-700">
              {t("sellPrice")} <UnitBadge>{t("per", { unit: qtyUnit })}</UnitBadge>
              <span className="font-semibold">{line.sellPrice != null ? formatCurrency(line.sellPrice) : "—"}</span>
              {line.currentPrice != null && line.sellPrice !== line.currentPrice && (
                <span className="text-xs text-gray-500">({t("was", { price: formatCurrency(line.currentPrice) })})</span>
              )}
            </p>
            <button type="button" onClick={() => setEditingPrice(true)} className="text-sm font-medium text-blue-700 hover:underline">
              {t("editPrice")}
            </button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {lineMargin != null &&
            (lineMargin < 0 ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600">
                <AlertTriangle className="h-3.5 w-3.5" /> {t("loss")}
              </span>
            ) : (
              <span className="text-xs text-gray-500">{t("margin", { percent: Math.round(lineMargin * 100) })}</span>
            ))}
          {priceSuggestion != null && priceSuggestion !== line.sellPrice && (
            <button
              type="button"
              onClick={() => update({ sellPrice: priceSuggestion })}
              className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-white px-2 py-1 text-xs font-medium text-blue-800 hover:bg-blue-50"
            >
              <Lightbulb className="h-3.5 w-3.5" />
              {isNew
                ? t("suggestNew", { price: formatCurrency(priceSuggestion) })
                : t("suggestRaise", { price: formatCurrency(priceSuggestion) })}
            </button>
          )}
        </div>
      </div>

      {isNew && (
        <div>
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${moreOpen ? "rotate-180" : ""}`} />
            {t("moreData")}
          </button>
          {moreOpen && (
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700" htmlFor={`cat-${line.key}`}>
                  {t("category")}
                </label>
                <Input
                  id={`cat-${line.key}`}
                  list={`cats-${line.key}`}
                  value={line.category}
                  onChange={(e) => update({ category: e.target.value })}
                  className="h-11"
                />
                <datalist id={`cats-${line.key}`}>
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700" htmlFor={`sku-${line.key}`}>
                  {t("barcode")}
                </label>
                <Input
                  id={`sku-${line.key}`}
                  value={line.sku}
                  onChange={(e) => update({ sku: e.target.value })}
                  placeholder={t("barcodeHint")}
                  className="h-11 font-mono"
                />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        <span className="hidden text-xs text-gray-400 sm:inline">{t("enterHint")}</span>
        <Button type="button" onClick={finish} className="h-11 gap-1.5 px-5">
          <Check className="h-4 w-4" /> {t("done")}
        </Button>
      </div>
    </div>
  );
}
