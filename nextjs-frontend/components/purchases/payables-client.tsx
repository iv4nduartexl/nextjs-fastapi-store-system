"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, Building2, CheckCircle2 } from "lucide-react";

import type { PayableInvoice, PayablesSummary } from "@/components/actions/purchasing-action";
import { useIsOwner } from "@/components/me-provider";
import { PaymentDialog } from "@/components/purchases/payment-dialog";
import { VoidDebtDialog } from "@/components/purchases/void-debt-dialog";
import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/routing";
import { formatCurrency } from "@/lib/currency";
import LocalDateSpan from "@/lib/LocalDateSpan";

function daysAgo(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

/** What is owed to each supplier, oldest invoices first, with a one-click "Pagar". */
export function PayablesClient({ summary, locale }: { summary: PayablesSummary; locale: string }) {
  const t = useTranslations("purchases.payments");
  const router = useRouter();
  const isOwner = useIsOwner();
  const [paying, setPaying] = useState<{ invoice: PayableInvoice; supplier: string | null } | null>(null);
  const [voiding, setVoiding] = useState<{ invoice: PayableInvoice; supplier: string | null } | null>(null);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <Link href="/purchases" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft className="h-4 w-4" /> {t("backToPurchases")}
      </Link>
      <header>
        <h1 className="text-2xl font-bold text-gray-900">{t("payablesTitle")}</h1>
        <p className="text-sm text-gray-500">
          {summary.supplier_count > 0
            ? t("youOwe", { amount: formatCurrency(summary.total_owed), count: summary.supplier_count })
            : t("nothingOwed")}
        </p>
      </header>

      {summary.suppliers.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border bg-white py-12 text-center">
          <CheckCircle2 className="h-10 w-10 text-green-500" />
          <p className="text-sm text-gray-600">{t("allPaid")}</p>
        </div>
      ) : (
        summary.suppliers.map((group) => (
          <section key={group.supplier_id ?? "none"} className="overflow-hidden rounded-2xl border bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-gray-50 px-4 py-3">
              <p className="flex items-center gap-2 font-semibold text-gray-900">
                <Building2 className="h-4 w-4 text-gray-400" />
                {group.supplier_name ?? t("noSupplier")}
              </p>
              <p className="text-sm">
                <span className="text-gray-500">{t("owesTotal")}</span>{" "}
                <span className="font-bold text-amber-700 tabular-nums">{formatCurrency(group.total_owed)}</span>
              </p>
            </div>
            <ul className="divide-y">
              {group.invoices.map((invoice) => {
                const age = daysAgo(invoice.purchase_date);
                return (
                  <li key={invoice.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <Link href={`/purchases/${invoice.id}`} className="font-medium text-gray-900 hover:underline">
                        <LocalDateSpan dateIso={invoice.purchase_date} locale={locale} options={{ day: "2-digit", month: "2-digit", year: "numeric" }} />
                        {invoice.reference_number && <span className="ml-2 font-mono text-gray-500">#{invoice.reference_number}</span>}
                      </Link>
                      <p className={`text-xs ${age > 30 ? "font-semibold text-red-600" : "text-gray-500"}`}>
                        {t("daysAgo", { days: age })} ·{" "}
                        {t("paidOf", { paid: formatCurrency(invoice.paid_amount), total: formatCurrency(invoice.total_cost) })}
                      </p>
                    </div>
                    <span className="font-semibold text-amber-700 tabular-nums">{formatCurrency(invoice.remaining)}</span>
                    {isOwner && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setVoiding({ invoice, supplier: group.supplier_name })}
                        className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                      >
                        {t("void.button")}
                      </Button>
                    )}
                    <Button size="sm" onClick={() => setPaying({ invoice, supplier: group.supplier_name })} className="bg-green-600 hover:bg-green-700">
                      {t("pay")}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      {voiding && (
        <VoidDebtDialog
          purchaseId={voiding.invoice.id}
          remaining={parseFloat(voiding.invoice.remaining)}
          supplierName={voiding.supplier}
          onClose={() => setVoiding(null)}
          onDone={() => {
            setVoiding(null);
            router.refresh();
          }}
        />
      )}

      {paying && (
        <PaymentDialog
          purchaseId={paying.invoice.id}
          remaining={parseFloat(paying.invoice.remaining)}
          supplierName={paying.supplier}
          onClose={() => setPaying(null)}
          onPaid={() => {
            setPaying(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
