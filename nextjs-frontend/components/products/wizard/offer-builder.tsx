"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Gift, Loader2, Package, Percent, Plus, Tag } from "lucide-react";

import { createItemDiscountRule } from "@/components/actions/items-action";
import { NumberField } from "@/components/purchases/wizard/number-field";
import { Button } from "@/components/ui/button";
import { currencySymbol, formatCurrency } from "@/lib/currency";
import { formatNumber } from "@/lib/format-number";
import type { ProductUnit } from "@/lib/products/draft";
import { roundPrice } from "@/lib/purchases/pricing";
import {
  OFFER_KINDS,
  emptyOffer,
  offerErrors,
  offerName,
  offerPreview,
  toDiscountRuleInput,
  type OfferDraft,
  type OfferError,
  type OfferKind,
} from "@/lib/products/offer";

const KIND_ICONS: Record<OfferKind, React.ElementType> = { pack: Package, buyGet: Gift, percent: Percent };

/**
 * After a product is created: "¿Tiene alguna oferta por cantidad?". Optional and separate from
 * the creation — the product already exists whatever happens here.
 */
export function OfferBuilder({ itemId, basePrice, unit }: { itemId: string; basePrice: number | null; unit: ProductUnit }) {
  const t = useTranslations("addItem.wizard.offer");
  const tUnits = useTranslations("addItem.wizard.stock.units");
  const [mode, setMode] = useState<"question" | "editing" | "closed">("question");
  const [offer, setOffer] = useState<OfferDraft>(emptyOffer());
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string[]>([]);

  if (!basePrice || basePrice <= 0) {
    return <p className="text-sm text-gray-400">{t("needsPrice")}</p>;
  }
  if (mode === "closed" && saved.length === 0) return null;

  const unitLabel = tUnits(unit);
  // "3 por ₲32.400": an example built from this product's own price
  const example = formatCurrency(roundPrice(basePrice * 3 * 0.9));
  const weighed = unit === "gram" || unit === "liter";
  const errors = offerErrors(offer, basePrice, unit);
  const set = (patch: Partial<OfferDraft>) => {
    setOffer((o) => ({ ...o, ...patch }));
    setError(null);
  };

  async function save() {
    setAttempted(true);
    if (errors.length > 0 || saving) return;
    setSaving(true);
    setError(null);
    const name = offerName(offer, { per: t("names.per"), from: t("names.from"), unit: weighed ? unitLabel : undefined });
    const result = await createItemDiscountRule(itemId, toDiscountRuleInput(offer, name));
    setSaving(false);
    if (result.error) {
      setError(t("saveError"));
      return;
    }
    setSaved((s) => [...s, name]);
    setOffer(emptyOffer(offer.kind));
    setAttempted(false);
    setMode("closed");
  }

  function errorText(code: OfferError) {
    if (code === "qty") return t(weighed && offer.kind !== "buyGet" ? "errors.qtyWeight" : "errors.qty");
    if (code === "packPrice") {
      const qty = offer.qty ?? 0;
      return t("errors.packPrice", {
        normal: formatCurrency(basePrice! * qty),
        qty: formatNumber(qty, 3),
        price: formatCurrency(basePrice),
      });
    }
    return t(`errors.${code}`);
  }

  const qtyField = (
    <NumberField
      aria-label={unitLabel}
      autoFocus
      value={offer.qty}
      onValueChange={(qty) => set({ qty })}
      decimals={weighed && offer.kind !== "buyGet" ? 3 : 0}
      unit={offer.kind === "buyGet" ? undefined : unitLabel}
      placeholder={offer.kind === "buyGet" ? "3" : weighed ? "2" : "3"}
      invalid={attempted && errors.includes("qty")}
      className="h-11 w-32"
    />
  );

  return (
    <div className="w-full rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-sm">
      {/* Saved offers stay listed so more tiers can be added */}
      {saved.length > 0 && (
        <ul className="mb-3 space-y-1.5">
          {saved.map((name) => (
            <li key={name} className="flex items-center gap-2 text-sm font-medium text-green-800">
              <Check className="h-4 w-4 shrink-0 text-green-600" />
              {t("saved", { name })}
            </li>
          ))}
        </ul>
      )}

      {mode === "question" && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <Tag className="h-5 w-5" />
            </span>
            <div>
              <p className="font-semibold text-gray-900">{t("question")}</p>
              <p className="text-sm text-gray-500">{t("questionHint", { example })}</p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="outline" onClick={() => setMode("closed")}>
              {t("no")}
            </Button>
            <Button size="sm" onClick={() => setMode("editing")} className="bg-amber-500 hover:bg-amber-600">
              {t("yes")}
            </Button>
          </div>
        </div>
      )}

      {mode === "closed" && saved.length > 0 && (
        <button
          type="button"
          onClick={() => setMode("editing")}
          className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline"
        >
          <Plus className="h-4 w-4" /> {t("another")}
        </button>
      )}

      {mode === "editing" && (
        <form
          className="space-y-4 animate-in fade-in slide-in-from-top-1"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <p className="flex items-center gap-2 font-semibold text-gray-900">
            <Tag className="h-4 w-4 text-amber-600" /> {t("title")}
          </p>

          <div role="radiogroup" className="grid gap-2 sm:grid-cols-3">
            {OFFER_KINDS.map((kind) => {
              const Icon = KIND_ICONS[kind];
              const active = offer.kind === kind;
              return (
                <button
                  key={kind}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    // Keep the quantity when switching, it usually stays the same
                    setOffer({ ...emptyOffer(kind), qty: offer.qty });
                    setAttempted(false);
                  }}
                  className={`flex items-start gap-2 rounded-xl border-2 p-3 text-left transition ${
                    active ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white hover:border-gray-400"
                  }`}
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    <span className="block text-sm font-semibold">{t(`kinds.${kind}`)}</span>
                    <span className={`block text-xs ${active ? "text-gray-300" : "text-gray-500"}`}>
                      {t(`kindExamples.${kind}`, { price: example })}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* The offer as a sentence with the blanks to fill */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-gray-50 p-3 text-base text-gray-800">
            {offer.kind === "pack" && (
              <>
                <span>{t("sentence.packBefore")}</span>
                {qtyField}
                <span>{t("sentence.packMiddle")}</span>
                <NumberField
                  aria-label={t("kinds.pack")}
                  prefix={currencySymbol}
                  value={offer.packPrice}
                  onValueChange={(packPrice) => set({ packPrice })}
                  invalid={attempted && errors.includes("packPrice")}
                  className="h-11 w-40"
                />
                <span>{t("sentence.packAfter")}</span>
              </>
            )}
            {offer.kind === "buyGet" && (
              <>
                <span>{t("sentence.buyTake")}</span>
                {qtyField}
                <span>{t("sentence.buyPay")}</span>
                <NumberField
                  aria-label={t("sentence.buyPay")}
                  value={offer.pay}
                  onValueChange={(pay) => set({ pay })}
                  placeholder="2"
                  invalid={attempted && errors.includes("pay")}
                  className="h-11 w-24"
                />
              </>
            )}
            {offer.kind === "percent" && (
              <>
                <span>{t("sentence.percentFrom")}</span>
                {qtyField}
                <NumberField
                  aria-label={t("kinds.percent")}
                  value={offer.percent}
                  onValueChange={(percent) => set({ percent })}
                  placeholder="10"
                  unit="%"
                  invalid={attempted && errors.includes("percent")}
                  className="h-11 w-28"
                />
                <span>{t("sentence.percentOff")}</span>
              </>
            )}
          </div>

          <OfferPreviewBox offer={offer} basePrice={basePrice} unit={unit} unitLabel={unitLabel} valid={errors.length === 0} />

          {attempted && errors.length > 0 && (
            <ul className="space-y-0.5 text-sm text-red-600">
              {errors.map((code) => (
                <li key={code}>{errorText(code)}</li>
              ))}
            </ul>
          )}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setMode(saved.length ? "closed" : "question")}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={saving} className="gap-1.5 bg-green-600 hover:bg-green-700">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("save")}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

/** What the register will charge, at the offer's quantity and below it. */
function OfferPreviewBox({
  offer,
  basePrice,
  unit,
  unitLabel,
  valid,
}: {
  offer: OfferDraft;
  basePrice: number;
  unit: ProductUnit;
  unitLabel: string;
  valid: boolean;
}) {
  const t = useTranslations("addItem.wizard.offer");
  if (!valid || offer.qty == null) return null;
  const qtyText = (q: number) => `${formatNumber(q, 3)} ${unitLabel}`;
  const at = offerPreview(offer, basePrice, unit, offer.qty);
  const perUnit = t(unit === "gram" ? "previewPerKg" : "previewPerUnit", { price: formatCurrency(at.perUnit, 2) });
  // One less than the offer (or a single one) still pays the normal price
  const below = unit === "unit" || unit === "pack" || offer.kind === "buyGet" ? 1 : null;

  return (
    <div className="space-y-1 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm animate-in fade-in">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-green-700">{t("previewTitle")}</p>
      <p className="font-medium text-green-900">
        {t("previewApplies", {
          qty: qtyText(offer.qty),
          total: formatCurrency(at.total, 2),
          normal: formatCurrency(at.normal, 2),
          savings: formatCurrency(at.savings, 2),
        })}{" "}
        <span className="font-normal text-green-700">{perUnit}</span>
      </p>
      {below != null && below < offer.qty && (
        <p className="text-green-800/80">
          {t("previewBelow", {
            qty: qtyText(below),
            total: formatCurrency(offerPreview(offer, basePrice, unit, below).total, 2),
          })}
        </p>
      )}
    </div>
  );
}
