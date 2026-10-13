"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, Check, ExternalLink, MessageCircle, Printer } from "lucide-react";

import type { SaleRead } from "@/components/actions/sales-action";
import { useMe } from "@/components/me-provider";
import { Link } from "@/i18n/routing";
import { formatCurrency } from "@/lib/currency";
import { printReceipt, receiptText, whatsappUrl, type ReceiptLabels } from "@/lib/pos/receipt";

/** Longer when there is change to hand back, so the cashier can read it */
const AUTO_NEXT_MS = { change: 7000, noChange: 3500 };

/**
 * "Done" step: the change in big type and the optional ticket.
 * Goes back to the products by itself; Enter, Esc or a scan do it right away.
 */
export function SaleDonePanel({ sale, header, onNext }: { sale: SaleRead; header: React.ReactNode; onNext: () => void }) {
  const t = useTranslations("sales.pos");
  const tSales = useTranslations("sales");
  const me = useMe();
  const change = sale.change_given != null ? Number(sale.change_given) : 0;
  const delay = change > 0 ? AUTO_NEXT_MS.change : AUTO_NEXT_MS.noChange;

  useEffect(() => {
    const timer = setTimeout(onNext, delay);
    return () => clearTimeout(timer);
  }, [sale.id, delay, onNext]);

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

  return (
    <div className="flex h-full flex-col bg-gray-50">
      <div className="border-b bg-white px-4 py-3 md:px-6">{header}</div>
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md overflow-hidden rounded-3xl border border-gray-200 bg-white text-center shadow-xl animate-in fade-in zoom-in-95 duration-200">
          <div className="px-8 pt-8 pb-6">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 animate-in zoom-in-50 duration-300">
              <Check className="h-8 w-8 text-green-600" strokeWidth={3} />
            </div>
            <h2 className="mt-4 text-xl font-bold text-gray-900">{t("doneTitle")}</h2>
            <p className="mt-1 text-sm text-gray-500">
              {formatCurrency(sale.total)} · {paymentLabel}
              {sale.customer_name ? ` · ${sale.customer_name}` : ""}
            </p>

            <div className={`mt-6 rounded-2xl px-6 py-5 ${change > 0 ? "bg-emerald-50" : "bg-gray-50"}`}>
              <p
                className={`text-xs font-semibold uppercase tracking-widest ${change > 0 ? "text-emerald-700" : "text-gray-400"}`}
              >
                {change > 0 ? t("changeDue") : t("noChange")}
              </p>
              {change > 0 && (
                <p className="mt-1 text-5xl font-black tracking-tight text-emerald-700 tabular-nums">
                  {formatCurrency(change)}
                </p>
              )}
            </div>

            <div className="mt-5 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => printReceipt(sale, businessName, labels, paymentLabel)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <Printer size={15} /> {t("print")}
              </button>
              <a
                href={whatsappUrl(receiptText(sale, businessName, labels, paymentLabel))}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <MessageCircle size={15} /> WhatsApp
              </a>
              <Link
                href={`/sales/${sale.id}`}
                className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <ExternalLink size={15} /> {t("viewSale")}
              </Link>
            </div>
          </div>

          <button
            type="button"
            onClick={onNext}
            className="group relative flex w-full items-center justify-center gap-2 overflow-hidden bg-gray-900 py-4 text-base font-bold text-white hover:bg-gray-800"
          >
            {/* Time left before going back by itself */}
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 bg-white/10"
              style={{ animation: `pos-countdown ${delay}ms linear forwards` }}
            />
            <span className="relative">{t("nextSale")}</span>
            <ArrowRight size={18} className="relative transition-transform group-hover:translate-x-0.5" />
          </button>
          <p className="bg-gray-900 pb-3 text-[11px] text-gray-400">{t("nextSaleHint")}</p>
        </div>
      </div>
      <style>{`@keyframes pos-countdown { from { width: 0% } to { width: 100% } }`}</style>
    </div>
  );
}
