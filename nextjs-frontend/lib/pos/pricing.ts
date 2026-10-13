// Cart pricing for the POS: quantity discounts, manual overrides and rounding.

export interface CartItem {
  itemId: string;
  name: string;
  unitType: string;
  category: string | null;
  unitPrice: number;
  /** A count for unit products, grams for weighed ones */
  quantity: number;
  manualOverridePrice?: number;
  manualOverrideReason?: string;
}

export interface QuantityDiscountRule {
  id: string;
  name: string;
  scope: "global" | "item" | "category";
  item_id: string | null;
  category: string | null;
  min_qty: string;
  rule_type: "percent" | "fixed_price" | "buy_x_get_y";
  percent_off: string | null;
  fixed_unit_price: string | null;
  buy_qty: string | null;
  free_qty: string | null;
}

export type PricingSource = "base" | "quantity_discount" | "manual_override";

export interface LinePricing {
  baseUnitPrice: number;
  effectiveUnitPrice: number;
  baseSubtotal: number;
  effectiveSubtotal: number;
  discountAmount: number;
  discountRuleName: string | null;
  pricingSource: PricingSource;
}

/** Weighed products are priced per kg but counted in grams */
export function toSaleUnits(quantity: number, unitType: string): number {
  return unitType === "gram" ? quantity / 1000 : quantity;
}

export function lineSubtotal(unitPrice: number, quantity: number, unitType: string): number {
  return unitType === "gram" ? (unitPrice * quantity) / 1000 : unitPrice * quantity;
}

/** The step used by the +/− buttons and keys: 100 g for weighed products, 1 otherwise */
export function quantityStep(unitType: string): number {
  return unitType === "gram" ? 100 : 1;
}

/** Price of a cart line: a manual override wins, otherwise the cheapest matching discount rule. */
export function getPricing(item: CartItem, rules: QuantityDiscountRule[]): LinePricing {
  const baseUnitPrice = item.unitPrice;
  const baseSubtotal = lineSubtotal(baseUnitPrice, item.quantity, item.unitType);

  if (item.manualOverridePrice != null) {
    const effectiveSubtotal = lineSubtotal(item.manualOverridePrice, item.quantity, item.unitType);
    return {
      baseUnitPrice,
      effectiveUnitPrice: item.manualOverridePrice,
      baseSubtotal,
      effectiveSubtotal,
      discountAmount: Math.max(0, baseSubtotal - effectiveSubtotal),
      discountRuleName: null,
      pricingSource: "manual_override",
    };
  }

  const saleUnits = toSaleUnits(item.quantity, item.unitType);
  const matching = rules.filter((r) => {
    const minQty = parseFloat(r.min_qty || "0");
    if (saleUnits < minQty) return false;
    if (r.scope === "item" && r.item_id !== item.itemId) return false;
    if (r.scope === "category" && r.category !== item.category) return false;
    return true;
  });

  let effectiveUnitPrice = baseUnitPrice;
  let ruleName: string | null = null;

  for (const rule of matching) {
    let candidate = baseUnitPrice;
    if (rule.rule_type === "percent" && rule.percent_off != null) {
      candidate = baseUnitPrice * (1 - parseFloat(rule.percent_off) / 100);
    } else if (rule.rule_type === "fixed_price" && rule.fixed_unit_price != null) {
      const minQty = parseFloat(rule.min_qty || "0");
      if (minQty > 0) candidate = parseFloat(rule.fixed_unit_price) / minQty;
    } else if (rule.rule_type === "buy_x_get_y" && rule.buy_qty != null && rule.free_qty != null) {
      const buyQty = parseFloat(rule.buy_qty);
      const freeQty = parseFloat(rule.free_qty);
      const group = buyQty + freeQty;
      if (group > 0) {
        const freeUnits = Math.floor(saleUnits / group) * freeQty;
        const payableUnits = Math.max(0, saleUnits - freeUnits);
        candidate = saleUnits > 0 ? (baseUnitPrice * payableUnits) / saleUnits : baseUnitPrice;
      }
    }

    if (candidate < effectiveUnitPrice) {
      effectiveUnitPrice = candidate;
      ruleName = rule.name;
    }
  }

  const effectiveSubtotal = lineSubtotal(effectiveUnitPrice, item.quantity, item.unitType);
  return {
    baseUnitPrice,
    effectiveUnitPrice,
    baseSubtotal,
    effectiveSubtotal,
    discountAmount: Math.max(0, baseSubtotal - effectiveSubtotal),
    discountRuleName: ruleName,
    pricingSource: ruleName ? "quantity_discount" : "base",
  };
}

export function cartTotal(cart: CartItem[], rules: QuantityDiscountRule[]): number {
  return cart.reduce((sum, item) => sum + getPricing(item, rules).effectiveSubtotal, 0);
}

/**
 * Unit price that rounds the line total (at the base price) up to the next 500,
 * e.g. 121 g at 7.000/kg = 847 → 1.000, so 8.264,46/kg. Null when it can't be computed.
 */
export function roundedUnitPrice(item: CartItem, step = 500): number | null {
  const saleUnits = toSaleUnits(item.quantity, item.unitType);
  if (!(saleUnits > 0)) return null;
  const roundedLine = Math.ceil(lineSubtotal(item.unitPrice, item.quantity, item.unitType) / step) * step;
  const price = roundedLine / saleUnits;
  return Number.isFinite(price) && price >= 0 ? price : null;
}

/** Number of items in the cart: weighed products count by kg */
export function cartCount(cart: CartItem[]): number {
  return cart.reduce((sum, c) => sum + toSaleUnits(c.quantity || 0, c.unitType), 0);
}
