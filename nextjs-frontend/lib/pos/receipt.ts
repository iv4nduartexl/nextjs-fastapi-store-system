// Optional ticket for a finished sale: 80mm print layout and a WhatsApp text.
import type { SaleRead } from "@/components/actions/sales-action";
import { formatCurrency } from "@/lib/currency";
import { formatNumber } from "@/lib/format-number";

export interface ReceiptLabels {
  title: string;
  total: string;
  received: string;
  change: string;
  payment: string;
  customer: string;
  thanks: string;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function quantityLabel(item: SaleRead["sale_items"][number]): string {
  const qty = parseFloat(item.quantity);
  return item.unit_type === "gram" ? `${formatNumber(qty)} g` : `${formatNumber(qty, 3)} ×`;
}

export function receiptText(sale: SaleRead, businessName: string, labels: ReceiptLabels, paymentLabel: string): string {
  const lines = [
    `*${businessName}*`,
    `${labels.title} #${sale.id.slice(0, 8)} · ${new Date(sale.created_at).toLocaleString()}`,
    "",
    ...sale.sale_items.map((i) => `${quantityLabel(i)} ${i.item_name} — ${formatCurrency(i.subtotal)}`),
    "",
    `*${labels.total}: ${formatCurrency(sale.total)}*`,
    `${labels.payment}: ${paymentLabel}`,
  ];
  if (sale.customer_name) lines.push(`${labels.customer}: ${sale.customer_name}`);
  lines.push("", labels.thanks);
  return lines.join("\n");
}

export function whatsappUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** Prints an 80mm ticket from a hidden iframe, without leaving the register. */
export function printReceipt(sale: SaleRead, businessName: string, labels: ReceiptLabels, paymentLabel: string) {
  const rows = sale.sale_items
    .map(
      (i) => `<tr><td>${escapeHtml(quantityLabel(i))} ${escapeHtml(i.item_name)}</td><td class="r">${escapeHtml(
        formatCurrency(i.subtotal),
      )}</td></tr>`,
    )
    .join("");
  const extra: string[] = [];
  if (sale.amount_tendered != null && Number(sale.amount_tendered) > 0) {
    extra.push(`<tr><td>${escapeHtml(labels.received)}</td><td class="r">${escapeHtml(formatCurrency(sale.amount_tendered))}</td></tr>`);
  }
  if (sale.change_given != null && Number(sale.change_given) > 0) {
    extra.push(`<tr><td>${escapeHtml(labels.change)}</td><td class="r">${escapeHtml(formatCurrency(sale.change_given))}</td></tr>`);
  }
  if (sale.customer_name) {
    extra.push(`<tr><td>${escapeHtml(labels.customer)}</td><td class="r">${escapeHtml(sale.customer_name)}</td></tr>`);
  }

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(labels.title)}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  body { font-family: ui-monospace, Menlo, monospace; font-size: 12px; width: 72mm; margin: 0; color: #000; }
  h1 { font-size: 15px; text-align: center; margin: 0 0 2px; }
  .muted { text-align: center; font-size: 10px; margin-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 1px 0; vertical-align: top; }
  .r { text-align: right; white-space: nowrap; padding-left: 6px; }
  .total td { font-size: 15px; font-weight: bold; border-top: 1px dashed #000; padding-top: 4px; }
  .thanks { text-align: center; margin-top: 8px; }
</style></head><body>
<h1>${escapeHtml(businessName)}</h1>
<div class="muted">${escapeHtml(labels.title)} #${escapeHtml(sale.id.slice(0, 8))} · ${escapeHtml(new Date(sale.created_at).toLocaleString())}</div>
<table>${rows}
<tr class="total"><td>${escapeHtml(labels.total)}</td><td class="r">${escapeHtml(formatCurrency(sale.total))}</td></tr>
<tr><td>${escapeHtml(labels.payment)}</td><td class="r">${escapeHtml(paymentLabel)}</td></tr>
${extra.join("")}</table>
<div class="thanks">${escapeHtml(labels.thanks)}</div>
</body></html>`;

  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  document.body.appendChild(frame);
  const doc = frame.contentWindow?.document;
  if (!doc) return;
  doc.open();
  doc.write(html);
  doc.close();
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 1000);
  };
}
