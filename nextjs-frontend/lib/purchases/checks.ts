// What blocks each wizard step (with the reason shown to the user) and what deserves a second look.
import { toDateInputValue } from "@/lib/dates";
import { normalize } from "@/lib/pos/catalog-search";
import { linesTotal, priceChanged, purchaseTotal, type PurchaseDraft, type PurchasingProduct } from "@/lib/purchases/draft";

export type WizardStep = "supplier" | "products" | "payment" | "review";
export const WIZARD_STEPS: WizardStep[] = ["supplier", "products", "payment", "review"];

/** Reason codes, translated under purchases.wizard.blocked.* */
export type BlockReason =
  | "chooseSupplier"
  | "invalidDate"
  | "addProducts"
  | "lineQuantity"
  | "lineCost"
  | "lineName"
  | "newProductPrice"
  | "choosePayment"
  | "partialAmount"
  | "cashboxSource"
  | "taxAmount";

/**
 * Something is paid now but the purchase is dated in the past: we must ask whether the money
 * left today's cashbox or was paid back then (a past day's cashbox was already counted).
 */
export function needsCashboxQuestion(draft: PurchaseDraft, today: string = toDateInputValue()): boolean {
  const { kind } = draft.payment;
  return (kind === "paid" || kind === "partial") && draft.date !== today;
}

export function stepBlockers(draft: PurchaseDraft, step: WizardStep): BlockReason[] {
  const reasons: BlockReason[] = [];
  if (step === "supplier") {
    if (!draft.supplier && !draft.noSupplier) reasons.push("chooseSupplier");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) reasons.push("invalidDate");
  }
  if (step === "products") {
    if (draft.lines.length === 0) reasons.push("addProducts");
    if (draft.lines.some((l) => !l.quantity || l.quantity <= 0)) reasons.push("lineQuantity");
    if (draft.lines.some((l) => l.lineTotal == null || l.lineTotal < 0)) reasons.push("lineCost");
    if (draft.lines.some((l) => l.itemId == null && !l.name.trim())) reasons.push("lineName");
    if (draft.lines.some((l) => l.itemId == null && (l.sellPrice == null || l.sellPrice <= 0))) reasons.push("newProductPrice");
  }
  if (step === "payment") {
    const { kind, paidAmount, hasTax, tax } = draft.payment;
    if (!kind) reasons.push("choosePayment");
    if (kind === "partial") {
      const total = purchaseTotal(draft);
      if (!paidAmount || paidAmount <= 0 || paidAmount >= total) reasons.push("partialAmount");
    }
    if (needsCashboxQuestion(draft) && draft.payment.fromCashboxToday == null) reasons.push("cashboxSource");
    if (hasTax && (tax == null || tax < 0)) reasons.push("taxAmount");
  }
  return reasons;
}

/** The first step that still has blockers (the furthest the user may go), or "review". */
export function firstBlockedStep(draft: PurchaseDraft): WizardStep {
  for (const step of WIZARD_STEPS.slice(0, 3)) {
    if (stepBlockers(draft, step).length > 0) return step;
  }
  return "review";
}

export type Warning =
  | { type: "loss"; lineKey: string; name: string }
  | { type: "costJump"; lineKey: string; name: string; last: number; now: number }
  | { type: "similarName"; lineKey: string; name: string; existing: string }
  | { type: "invoiceMismatch"; difference: number };

const COST_JUMP = 0.3;

/** Plausibility checks: shown as warnings, never blocking. */
export function draftWarnings(draft: PurchaseDraft, catalog: PurchasingProduct[]): Warning[] {
  const warnings: Warning[] = [];
  for (const line of draft.lines) {
    if (line.unitCost != null && line.sellPrice != null && line.unitCost > line.sellPrice) {
      warnings.push({ type: "loss", lineKey: line.key, name: line.name });
    }
    if (line.unitCost != null && line.lastUnitCost && Math.abs(line.unitCost - line.lastUnitCost) / line.lastUnitCost > COST_JUMP) {
      warnings.push({ type: "costJump", lineKey: line.key, name: line.name, last: line.lastUnitCost, now: line.unitCost });
    }
    if (line.itemId == null) {
      const similar = findSimilarProduct(line.name, catalog);
      if (similar) warnings.push({ type: "similarName", lineKey: line.key, name: line.name, existing: similar.name });
    }
  }
  if (draft.invoiceTotal != null && draft.invoiceTotal > 0) {
    const difference = Math.round((draft.invoiceTotal - purchaseTotal(draft)) * 100) / 100;
    if (Math.abs(difference) >= 1) warnings.push({ type: "invoiceMismatch", difference });
  }
  return warnings;
}

/** An existing product whose name looks like the new one (to avoid creating duplicates). */
export function findSimilarProduct<T extends { name: string }>(name: string, catalog: T[]): T | undefined {
  const wanted = normalize(name).replace(/\s+/g, " ");
  if (wanted.length < 3) return undefined;
  return catalog.find((p) => {
    const existing = normalize(p.name).replace(/\s+/g, " ");
    if (existing === wanted) return true;
    const shorter = existing.length < wanted.length ? existing : wanted;
    const longer = existing.length < wanted.length ? wanted : existing;
    return shorter.length >= 4 && longer.includes(shorter);
  });
}

/** Lines whose sell price change will be written to the catalog. */
export function priceChanges(draft: PurchaseDraft) {
  return draft.lines.filter(priceChanged);
}

export { linesTotal };
