// Turns a finished wizard draft into the existing POST /purchases/ request.
import type { PurchaseCreate, SupplierCreate } from "@/components/actions/purchases-action";
import { dateInputToIso, toDateInputValue } from "@/lib/dates";
import { priceChanged, purchaseTotal, type PurchaseDraft } from "@/lib/purchases/draft";

export function toPurchaseCreate(draft: PurchaseDraft, now: Date = new Date()): PurchaseCreate {
  const { kind, method, paidAmount, hasTax, tax, notes, fromCashboxToday } = draft.payment;
  const total = purchaseTotal(draft);
  const paysNow = kind === "paid" || kind === "partial";
  // Dated today → today's cashbox. Past date → only if the user said the money left today's cashbox.
  const affectsCashbox = paysNow ? draft.date === toDateInputValue(now) || fromCashboxToday === true : undefined;

  return {
    supplier: draft.supplier
      ? { id: draft.supplier.id as SupplierCreate["id"], name: draft.supplier.name }
      : undefined,
    reference_number: draft.invoiceNumber.trim() || undefined,
    purchase_date: dateInputToIso(draft.date, now),
    // "Pay later" is supplier credit: nothing leaves the cashbox now
    payment_method: kind === "later" ? "credit" : method,
    payment_status: kind === "paid" ? "paid" : kind === "partial" ? "partial" : "unpaid",
    paid_amount: kind === "partial" ? paidAmount ?? undefined : kind === "paid" ? total : undefined,
    tax: hasTax ? tax ?? 0 : 0,
    notes: notes.trim() || undefined,
    invoice_total: draft.invoiceTotal ?? undefined,
    payment_affects_cashbox: affectsCashbox,
    items: draft.lines.map((line) => {
      const isNew = line.itemId == null;
      const updatePrice = !isNew && priceChanged(line) && line.applyPriceChange;
      return {
        item_id: line.itemId ?? undefined,
        item_name: line.name.trim(),
        unit_type: line.unitType,
        quantity: line.quantity ?? 0,
        total_cost_price: line.lineTotal ?? 0,
        // New products take everything; existing ones only change the price when confirmed in review
        sku: isNew ? line.sku.trim() || undefined : undefined,
        category: isNew ? line.category.trim() || undefined : undefined,
        sell_price: isNew ? line.sellPrice ?? undefined : updatePrice ? line.sellPrice ?? undefined : undefined,
        overwrite_previous_value: updatePrice,
      };
    }),
  };
}
