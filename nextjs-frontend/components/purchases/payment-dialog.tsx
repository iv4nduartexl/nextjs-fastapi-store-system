"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRightLeft, Banknote, CreditCard, Loader2, X } from "lucide-react";

import { addSupplierPayment, type PurchaseRead } from "@/components/actions/purchases-action";
import { NumberField } from "@/components/purchases/wizard/number-field";
import { Button } from "@/components/ui/button";
import { currencySymbol, formatCurrency } from "@/lib/currency";
import { dateInputToIso, toDateInputValue } from "@/lib/dates";

type Method = "cash" | "card" | "transfer";
const METHODS: { method: Method; icon: React.ElementType }[] = [
  { method: "cash", icon: Banknote },
  { method: "card", icon: CreditCard },
  { method: "transfer", icon: ArrowRightLeft },
];

interface PaymentDialogProps {
  purchaseId: string;
  remaining: number;
  supplierName: string | null;
  onClose: () => void;
  onPaid: (purchase: PurchaseRead) => void;
}

const KNOWN_ERRORS = ["payment_exceeds_remaining", "payment_date_in_future", "purchase_cancelled"];

/** Guided payment towards a purchase: amount → method → date (→ cashbox question for past days). */
export function PaymentDialog({ purchaseId, remaining, supplierName, onClose, onPaid }: PaymentDialogProps) {
  const t = useTranslations("purchases.payments");
  const tPay = useTranslations("purchases.wizard.payment");
  const today = toDateInputValue();
  const yesterday = toDateInputValue(new Date(Date.now() - 86400000));
  const [amount, setAmount] = useState<number | null>(remaining);
  const [method, setMethod] = useState<Method>("cash");
  const [date, setDate] = useState(today);
  const [fromToday, setFromToday] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPast = date !== today;
  const amountInvalid = amount == null || amount <= 0 || amount > remaining;
  const missingSource = isPast && fromToday == null;
  const after = Math.max(0, remaining - (amount ?? 0));
  const affectsCashbox = !isPast || fromToday === true;

  const reason = amountInvalid
    ? amount != null && amount > remaining
      ? t("errors.tooMuch", { remaining: formatCurrency(remaining) })
      : t("errors.amount")
    : missingSource
      ? t("errors.source")
      : null;

  async function submit() {
    if (reason || submitting || amount == null) return;
    setSubmitting(true);
    setError(null);
    const result = await addSupplierPayment(purchaseId, {
      amount,
      method,
      paid_at: dateInputToIso(date),
      affects_cashbox: affectsCashbox,
    });
    setSubmitting(false);
    if (result.data) onPaid(result.data);
    else setError(result.error && KNOWN_ERRORS.includes(result.error) ? t(`errors.${result.error}`) : result.error ?? t("errors.generic"));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="mx-4 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between border-b px-5 py-4">
          <div>
            <h3 className="font-semibold text-gray-900">{t("dialogTitle")}</h3>
            <p className="text-xs text-gray-500">
              {supplierName && <>{supplierName} · </>}
              {t("owed", { amount: formatCurrency(remaining) })}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label={t("close")}>
            <X size={16} />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          <div className="space-y-1.5">
            <label htmlFor="payment-amount" className="text-sm font-medium text-gray-700">
              {t("amount")} <span className="text-red-500">*</span>
            </label>
            <NumberField
              id="payment-amount"
              autoFocus
              prefix={currencySymbol}
              value={amount}
              onValueChange={setAmount}
              invalid={amount != null && amountInvalid}
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => setAmount(remaining)} className="rounded-lg border px-2.5 py-1 text-xs font-medium hover:bg-gray-50">
                {t("allOwed", { amount: formatCurrency(remaining) })}
              </button>
              <button
                type="button"
                onClick={() => setAmount(Math.round(remaining / 2))}
                className="rounded-lg border px-2.5 py-1 text-xs font-medium hover:bg-gray-50"
              >
                {t("half")}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-medium text-gray-700">{tPay("method")}</p>
            <div className="flex flex-wrap gap-2">
              {METHODS.map(({ method: m, icon: Icon }) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-medium ${
                    method === m ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white hover:bg-gray-50"
                  }`}
                >
                  <Icon className="h-4 w-4" /> {tPay(`methods.${m}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-medium text-gray-700">{t("date")}</p>
            <div className="flex flex-wrap items-center gap-2">
              {[
                { value: today, label: t("today") },
                { value: yesterday, label: t("yesterday") },
              ].map((chip) => (
                <button
                  key={chip.value}
                  type="button"
                  onClick={() => setDate(chip.value)}
                  className={`h-10 rounded-lg border px-3 text-sm font-medium ${
                    date === chip.value ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white hover:bg-gray-50"
                  }`}
                >
                  {chip.label}
                </button>
              ))}
              <input
                type="date"
                value={date}
                max={today}
                onChange={(e) => e.target.value && setDate(e.target.value)}
                className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm"
              />
            </div>
          </div>

          {isPast && (
            <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50/60 p-3">
              <p className="text-sm font-semibold text-gray-900">
                {t("sourceQuestion")} <span className="text-red-500">*</span>
              </p>
              <div className="grid gap-2">
                {([true, false] as const).map((value) => (
                  <button
                    key={String(value)}
                    type="button"
                    onClick={() => setFromToday(value)}
                    className={`rounded-lg border-2 p-2.5 text-left ${
                      fromToday === value ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white hover:border-gray-400"
                    }`}
                  >
                    <span className="block text-sm font-semibold">{tPay(value ? "fromToday" : "paidBackThen")}</span>
                    <span className={`block text-xs ${fromToday === value ? "text-gray-300" : "text-gray-500"}`}>
                      {tPay(value ? "fromTodayHint" : "paidBackThenHint")}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {!amountInvalid && (
            <div className="space-y-0.5 rounded-xl bg-gray-50 px-3 py-2 text-sm">
              <p className="font-medium text-gray-900">
                {after > 0 ? t("willOwe", { amount: formatCurrency(after) }) : t("willBePaid")}
              </p>
              {!missingSource && (
                <p className="text-gray-600">
                  {affectsCashbox ? t("cashboxImpact", { amount: formatCurrency(amount ?? 0) }) : t("noCashboxImpact")}
                </p>
              )}
            </div>
          )}

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

          <div className="flex items-center justify-end gap-3">
            {reason && <p className="min-w-0 flex-1 text-xs text-red-600">{reason}</p>}
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={!!reason || submitting} className="bg-green-600 hover:bg-green-700">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("confirm")}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
