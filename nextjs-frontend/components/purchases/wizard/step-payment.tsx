"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRightLeft, Banknote, CalendarClock, CircleDollarSign, CreditCard, Info, PieChart } from "lucide-react";

import { hasOpenCashbox } from "@/components/actions/purchasing-action";
import { NumberField } from "@/components/purchases/wizard/number-field";
import { Link } from "@/i18n/routing";
import { currencySymbol, formatCurrency } from "@/lib/currency";
import { formatDateInputValue } from "@/lib/dates";
import { needsCashboxQuestion } from "@/lib/purchases/checks";
import { purchaseTotal, type DraftAction, type PaymentKind, type PayMethod, type PurchaseDraft } from "@/lib/purchases/draft";

const KINDS: { kind: PaymentKind; icon: React.ElementType }[] = [
  { kind: "paid", icon: CircleDollarSign },
  { kind: "partial", icon: PieChart },
  { kind: "later", icon: CalendarClock },
];
const METHODS: { method: PayMethod; icon: React.ElementType }[] = [
  { method: "cash", icon: Banknote },
  { method: "card", icon: CreditCard },
  { method: "transfer", icon: ArrowRightLeft },
];

export function StepPayment({ draft, dispatch }: { draft: PurchaseDraft; dispatch: (action: DraftAction) => void }) {
  const t = useTranslations("purchases.wizard.payment");
  const locale = useLocale();
  const { kind, method, paidAmount, hasTax, tax, notes } = draft.payment;
  const total = purchaseTotal(draft);
  const paysNow = kind === "paid" ? total : kind === "partial" ? paidAmount ?? 0 : 0;
  const [cashboxOpen, setCashboxOpen] = useState<boolean | null>(null);
  const [touchedPaid, setTouchedPaid] = useState(false);

  useEffect(() => {
    hasOpenCashbox().then(setCashboxOpen);
  }, []);

  const set = (patch: Partial<PurchaseDraft["payment"]>) => dispatch({ type: "setPayment", patch });
  // Past-dated purchase paid now: where did the money come from?
  const askCashbox = needsCashboxQuestion(draft);
  const fromToday = askCashbox ? draft.payment.fromCashboxToday : true;
  const partialInvalid = kind === "partial" && touchedPaid && !(paidAmount && paidAmount > 0 && paidAmount < total);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
        <p className="text-sm text-gray-500">{t("subtitle", { total: formatCurrency(total, 2) })}</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        {KINDS.map(({ kind: k, icon: Icon }) => (
          <button
            key={k}
            type="button"
            onClick={() => set({ kind: k })}
            className={`flex flex-col items-start gap-2 rounded-2xl border-2 p-4 text-left transition ${
              kind === k ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white hover:border-gray-400"
            }`}
          >
            <Icon className="h-6 w-6" />
            <span className="text-base font-semibold">{t(`kind.${k}`)}</span>
            <span className={`text-xs ${kind === k ? "text-gray-300" : "text-gray-500"}`}>{t(`kindHint.${k}`)}</span>
          </button>
        ))}
      </div>

      {kind === "partial" && (
        <div className="max-w-sm space-y-1.5">
          <label htmlFor="paid-amount" className="text-sm font-medium text-gray-700">
            {t("paidAmount")} <span className="text-red-500">*</span>
          </label>
          <NumberField
            id="paid-amount"
            autoFocus
            prefix={currencySymbol}
            value={paidAmount}
            onValueChange={(v) => set({ paidAmount: v })}
            onBlur={() => setTouchedPaid(true)}
            invalid={partialInvalid}
          />
          <p className={`text-xs ${partialInvalid ? "text-red-600" : "text-gray-500"}`}>
            {partialInvalid
              ? t("paidAmountInvalid", { total: formatCurrency(total) })
              : t("stillOwed", { amount: formatCurrency(Math.max(0, total - (paidAmount ?? 0))) })}
          </p>
        </div>
      )}

      {(kind === "paid" || kind === "partial") && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">{t("method")}</p>
          <div className="flex flex-wrap gap-2">
            {METHODS.map(({ method: m, icon: Icon }) => (
              <button
                key={m}
                type="button"
                onClick={() => set({ method: m })}
                className={`inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-medium ${
                  method === m ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white hover:bg-gray-50"
                }`}
              >
                <Icon className="h-4 w-4" /> {t(`methods.${m}`)}
              </button>
            ))}
          </div>
          {askCashbox && (
            <div className="space-y-2 rounded-2xl border border-blue-200 bg-blue-50/60 p-4">
              <p className="text-sm font-semibold text-gray-900">
                {t("cashboxQuestion", { date: formatDateInputValue(draft.date, locale) })} <span className="text-red-500">*</span>
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {([true, false] as const).map((value) => (
                  <button
                    key={String(value)}
                    type="button"
                    onClick={() => set({ fromCashboxToday: value })}
                    className={`rounded-xl border-2 p-3 text-left transition ${
                      draft.payment.fromCashboxToday === value
                        ? "border-gray-900 bg-gray-900 text-white"
                        : "border-gray-200 bg-white hover:border-gray-400"
                    }`}
                  >
                    <span className="block text-sm font-semibold">{t(value ? "fromToday" : "paidBackThen")}</span>
                    <span className={`block text-xs ${draft.payment.fromCashboxToday === value ? "text-gray-300" : "text-gray-500"}`}>
                      {t(value ? "fromTodayHint" : "paidBackThenHint")}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {method === "cash" && paysNow > 0 && cashboxOpen != null && fromToday === true && (
            <p
              className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
                cashboxOpen ? "bg-gray-50 text-gray-700" : "bg-amber-50 text-amber-900"
              }`}
            >
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              {cashboxOpen ? (
                t("cashboxOut", { amount: formatCurrency(paysNow) })
              ) : (
                <span>
                  {t("cashboxClosed")}{" "}
                  <Link href="/cashbox" className="font-medium underline">
                    {t("openCashbox")}
                  </Link>
                </span>
              )}
            </p>
          )}
        </div>
      )}

      {kind === "later" && <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">{t("laterInfo")}</p>}

      <div className="space-y-4 border-t pt-6">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={hasTax} onChange={(e) => set({ hasTax: e.target.checked })} className="h-4 w-4" />
          {t("hasTax")}
        </label>
        {hasTax && (
          <div className="max-w-xs space-y-1.5">
            <label htmlFor="tax" className="text-sm font-medium text-gray-700">
              {t("tax")}
            </label>
            <NumberField id="tax" prefix={currencySymbol} value={tax} onValueChange={(v) => set({ tax: v })} />
          </div>
        )}
        <div className="space-y-1.5">
          <label htmlFor="notes" className="text-sm font-medium text-gray-700">
            {t("notes")} <span className="font-normal text-gray-400">({t("optional")})</span>
          </label>
          <textarea
            id="notes"
            rows={2}
            value={notes}
            onChange={(e) => set({ notes: e.target.value })}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900/10"
          />
        </div>
      </div>
    </div>
  );
}
