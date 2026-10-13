// Quantity offers in shop language ("3 por ₲30.000", "3x2", "10% llevando 6") ↔ discount rules.
import type { QuantityDiscountRuleInput } from "@/components/actions/items-action";
import { formatCurrency } from "@/lib/currency";
import { formatNumber } from "@/lib/format-number";
import { getPricing, type QuantityDiscountRule } from "@/lib/pos/pricing";
import type { ProductUnit } from "@/lib/products/draft";

/** pack = "N por ₲X" · buyGet = "lleva N, paga M" · percent = "desde N, X% menos" */
export type OfferKind = "pack" | "buyGet" | "percent";
export const OFFER_KINDS: OfferKind[] = ["pack", "buyGet", "percent"];

export interface OfferDraft {
  kind: OfferKind;
  /** How many the customer takes (kg for weighed products) */
  qty: number | null;
  /** pack: what they pay for all of them */
  packPrice: number | null;
  /** buyGet: how many they pay for */
  pay: number | null;
  /** percent: 1–99 */
  percent: number | null;
}

/** Codes translated under addItem.wizard.offer.errors.* */
export type OfferError = "qty" | "packPrice" | "pay" | "percent";

export function emptyOffer(kind: OfferKind = "pack"): OfferDraft {
  return { kind, qty: null, packPrice: null, pay: null, percent: null };
}

/** Countable products need whole quantities of at least 2; weighed ones any amount above 0 */
function validQty(qty: number | null, unit: ProductUnit, kind: OfferKind): qty is number {
  if (qty == null || qty <= 0) return false;
  const countable = unit === "unit" || unit === "pack" || kind === "buyGet";
  return countable ? Number.isInteger(qty) && qty >= 2 : true;
}

export function offerErrors(offer: OfferDraft, basePrice: number, unit: ProductUnit): OfferError[] {
  const errors: OfferError[] = [];
  const qtyOk = validQty(offer.qty, unit, offer.kind);
  if (!qtyOk) errors.push("qty");
  if (offer.kind === "pack") {
    const normal = qtyOk ? basePrice * offer.qty! : Infinity;
    if (offer.packPrice == null || offer.packPrice <= 0 || offer.packPrice >= normal) errors.push("packPrice");
  }
  if (offer.kind === "buyGet") {
    if (offer.pay == null || !Number.isInteger(offer.pay) || offer.pay < 1 || (qtyOk && offer.pay >= offer.qty!)) {
      errors.push("pay");
    }
  }
  if (offer.kind === "percent" && (offer.percent == null || offer.percent < 1 || offer.percent > 99)) {
    errors.push("percent");
  }
  return errors;
}

/**
 * The rule's name, shown on the register's discount badge: "3 por ₲30.000", "3x2", "10% desde 6".
 * `words` come from the translations; `unit` is added for kg / L ("2 kg por ₲…").
 */
export function offerName(offer: OfferDraft, words: { per: string; from: string; unit?: string }): string {
  const qty = `${formatNumber(offer.qty ?? 0, 3)}${words.unit ? ` ${words.unit}` : ""}`;
  switch (offer.kind) {
    case "pack":
      return `${qty} ${words.per} ${formatCurrency(offer.packPrice ?? 0)}`;
    case "buyGet":
      return `${formatNumber(offer.qty ?? 0)}x${formatNumber(offer.pay ?? 0)}`;
    case "percent":
      return `${formatNumber(offer.percent ?? 0)}% ${words.from} ${qty}`;
  }
}

export function toDiscountRuleInput(offer: OfferDraft, name: string): QuantityDiscountRuleInput {
  const qty = offer.qty ?? 0;
  switch (offer.kind) {
    case "pack":
      // The API stores the pack total; the register divides it by min_qty
      return { name, min_qty: qty, rule_type: "fixed_price", fixed_unit_price: offer.packPrice };
    case "buyGet":
      return {
        name,
        min_qty: qty,
        rule_type: "buy_x_get_y",
        buy_qty: offer.pay,
        free_qty: qty - (offer.pay ?? 0),
      };
    case "percent":
      return { name, min_qty: qty, rule_type: "percent", percent_off: offer.percent };
  }
}

export interface OfferPreview {
  /** What the customer pays with the offer */
  total: number;
  /** What they'd pay without it */
  normal: number;
  savings: number;
  /** Effective price per unit / kg */
  perUnit: number;
  applies: boolean;
}

/**
 * What `qty` (units or kg) costs with the offer, computed by the register's own pricing
 * so the preview is exactly what will be charged.
 */
export function offerPreview(offer: OfferDraft, basePrice: number, unit: ProductUnit, qty: number): OfferPreview {
  const input = toDiscountRuleInput(offer, "preview");
  const rule: QuantityDiscountRule = {
    id: "preview",
    name: "preview",
    scope: "item",
    item_id: "preview",
    category: null,
    min_qty: String(input.min_qty),
    rule_type: input.rule_type,
    percent_off: input.percent_off != null ? String(input.percent_off) : null,
    fixed_unit_price: input.fixed_unit_price != null ? String(input.fixed_unit_price) : null,
    buy_qty: input.buy_qty != null ? String(input.buy_qty) : null,
    free_qty: input.free_qty != null ? String(input.free_qty) : null,
  };
  const pricing = getPricing(
    {
      itemId: "preview",
      name: "preview",
      unitType: unit,
      category: null,
      unitPrice: basePrice,
      // The cart counts weighed products in grams
      quantity: unit === "gram" ? qty * 1000 : qty,
    },
    [rule],
  );
  return {
    total: pricing.effectiveSubtotal,
    normal: pricing.baseSubtotal,
    savings: pricing.discountAmount,
    perUnit: pricing.effectiveUnitPrice,
    applies: pricing.pricingSource === "quantity_discount",
  };
}
