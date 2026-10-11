"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, ExternalLink, MessageCircle, Printer, X } from "lucide-react";

import type { SaleRead } from "@/components/actions/sales-action";
import { useMe } from "@/components/me-provider";
import { Link } from "@/i18n/routing";
import { formatCurrency } from "@/lib/currency";
import { printReceipt, receiptText, whatsappUrl, type ReceiptLabels } from "@/lib/pos/receipt";

const AUTO_HIDE_MS = 10000;

/**
 * Step 3 of a sale: a small confirmation that never blocks the next customer.
 * The ticket (print / WhatsApp) is optional.
 */
export function SaleDoneBanner({ sale, onDismiss }: { sale: SaleRead; onDismiss: () => void }) {
  const t = useTranslations("sales.pos");
  const tSales = useTranslations("sales");
  const me = useMe();

  useEffect(() => {
    const timer = setTimeout(onDismiss, AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [sale.id, onDismiss]);

  const labels: ReceiptLabels = {
    title: t("ticket"),
    total: t("receiptTotal"),
    received: t("amountTendered"),
    change: t("receiptChange"),
    payment: t("receiptPayment"),
    customer: t("receiptCustomer"),
    thanks: t("ticketThanks"),
  };
  const businessName = me?.business_name ?? "";
  const paymentLabel = tSales(`paymentMethod.${sale.payment_method}`);
  const change = sale.change_given != null ? Number(sale.change_given) : 0;

  return (
    <div
      role="status"
      className="mx-3 mt-3 flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 px-3 py-2.5 shadow-sm animate-in fade-in slide-in-from-top-1"
    >
      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-green-900">
          {t("saleDone", { total: formatCurrency(sale.total) })}
        </p>
        {change > 0 && (
          <p className="text-lg font-bold leading-tight text-green-700 tabular-nums">
            {t("receiptChange")}: {formatCurrency(change)}
          </p>
        )}
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => printReceipt(sale, businessName, labels, paymentLabel)}
            className="inline-flex items-center gap-1 rounded-md border border-green-200 bg-white px-2 py-1 text-xs font-medium text-green-800 hover:bg-green-100"
          >
            <Printer size={13} /> {t("print")}
          </button>
          <a
            href={whatsappUrl(receiptText(sale, businessName, labels, paymentLabel))}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-green-200 bg-white px-2 py-1 text-xs font-medium text-green-800 hover:bg-green-100"
          >
            <MessageCircle size={13} /> WhatsApp
          </a>
          <Link
            href={`/sales/${sale.id}`}
            className="inline-flex items-center gap-1 rounded-md border border-green-200 bg-white px-2 py-1 text-xs font-medium text-green-800 hover:bg-green-100"
          >
            <ExternalLink size={13} /> {t("viewSale")}
          </Link>
        </div>
      </div>
      <button onClick={onDismiss} className="text-green-600 hover:text-green-900" aria-label={t("dismiss")}>
        <X size={16} />
      </button>
    </div>
  );
}
