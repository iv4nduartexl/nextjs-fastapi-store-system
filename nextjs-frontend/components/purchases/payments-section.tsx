"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";

import { deleteSupplierPayment, type PurchaseRead } from "@/components/actions/purchases-action";
import { useIsOwner } from "@/components/me-provider";
import { PaymentDialog } from "@/components/purchases/payment-dialog";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/routing";
import { formatCurrency } from "@/lib/currency";
import LocalDateSpan from "@/lib/LocalDateSpan";

/** Paid / remaining for a purchase, its payment history, and paying the rest. */
export function PaymentsSection({ purchase: initial, locale }: { purchase: PurchaseRead; locale: string }) {
  const t = useTranslations("purchases.payments");
  const tPay = useTranslations("purchases.wizard.payment");
  const isOwner = useIsOwner();
  const router = useRouter();
  const [purchase, setPurchase] = useState(initial);
  const [paying, setPaying] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const total = parseFloat(purchase.total_cost);
  const paid = parseFloat(purchase.paid_amount ?? "0") || 0;
  const remaining = Math.max(0, Math.round((total - paid) * 100) / 100);
  const percent = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  const cancelled = purchase.status === "cancelled";
  const payments = purchase.payments ?? [];

  function updated(next: PurchaseRead) {
    setPurchase(next);
    router.refresh();
  }

  async function remove(paymentId: string) {
    if (!confirm(t("confirmDelete"))) return;
    setBusyId(paymentId);
    setError(null);
    const result = await deleteSupplierPayment(purchase.id, paymentId);
    setBusyId(null);
    if (result.data) updated(result.data);
    else setError(result.error ?? t("errors.generic"));
  }

  return (
    <section className="space-y-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">{t("title")}</p>
          <p className="mt-1 text-sm text-gray-700">
            {t("paidOf", { paid: formatCurrency(paid), total: formatCurrency(total) })}
            {remaining > 0 && !cancelled && (
              <span className="ml-2 font-semibold text-amber-700">· {t("missing", { amount: formatCurrency(remaining) })}</span>
            )}
          </p>
        </div>
        {remaining > 0 && !cancelled && (
          <Button onClick={() => setPaying(true)} className="gap-1.5 bg-green-600 hover:bg-green-700">
            <Plus className="h-4 w-4" /> {t("register")}
          </Button>
        )}
      </div>

      <div className="h-2.5 overflow-hidden rounded-full bg-gray-100" aria-hidden>
        <div className={`h-full rounded-full ${percent >= 100 ? "bg-green-500" : "bg-amber-400"}`} style={{ width: `${percent}%` }} />
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {payments.length === 0 ? (
        <p className="text-sm text-gray-500">{t("none")}</p>
      ) : (
        <ul className="divide-y text-sm">
          {payments.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-900">
                  {formatCurrency(p.amount)} · {p.method === "write_off" ? t("writtenOff") : tPay(`methods.${p.method}`)}
                </p>
                <p className="text-xs text-gray-500">
                  <LocalDateSpan dateIso={p.paid_at} locale={locale} options={{ day: "2-digit", month: "2-digit", year: "numeric" }} />
                  {p.user_name && <> · {p.user_name}</>}
                  {p.notes && <> · «{p.notes}»</>}
                </p>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  p.affects_cashbox ? "bg-gray-100 text-gray-700" : "bg-blue-50 text-blue-800"
                }`}
              >
                {p.affects_cashbox ? t("inCashbox") : t("outsideCashbox")}
              </span>
              {isOwner && !cancelled && (
                <button
                  type="button"
                  onClick={() => remove(p.id)}
                  disabled={busyId === p.id}
                  className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                  aria-label={t("delete")}
                  title={t("delete")}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {paying && (
        <PaymentDialog
          purchaseId={purchase.id}
          remaining={remaining}
          supplierName={purchase.supplier?.name ?? null}
          onClose={() => setPaying(false)}
          onPaid={(next) => {
            setPaying(false);
            updated(next);
          }}
        />
      )}
    </section>
  );
}
