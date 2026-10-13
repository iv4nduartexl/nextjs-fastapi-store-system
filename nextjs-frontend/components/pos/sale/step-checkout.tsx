"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, Crown, Loader2, Pencil } from "lucide-react";

import type { CustomerRead } from "@/components/actions/customers-action";
import { CashTender } from "@/components/pos/sale/cash-tender";
import { CreditCustomer } from "@/components/pos/sale/credit-customer";
import { PaymentTiles } from "@/components/pos/sale/payment-tiles";
import { formatCurrency } from "@/lib/currency";
import { formatNumber } from "@/lib/format-number";
import { toSaleUnits, type CartItem, type LinePricing } from "@/lib/pos/pricing";
import type { CheckoutBlocker, PaymentMethod } from "@/lib/pos/sale";

/** Step 2: what is being charged on the left, how it's paid on the right. */
export function StepCheckout({
  header,
  cart,
  pricingOf,
  total,
  subtotal,
  subtotalOverride,
  method,
  onMethod,
  tendered,
  onTendered,
  customer,
  onCustomer,
  partialPayment,
  onPartialPayment,
  blockers,
  error,
  submitting,
  onConfirm,
  onBack,
  onEditSubtotal,
}: {
  header: React.ReactNode;
  cart: CartItem[];
  pricingOf: (item: CartItem) => LinePricing;
  total: number;
  subtotal: number;
  subtotalOverride: { amount: number; reason: string } | null;
  method: PaymentMethod;
  onMethod: (method: PaymentMethod) => void;
  tendered: string;
  onTendered: (value: string) => void;
  customer: CustomerRead | null;
  onCustomer: (customer: CustomerRead | null) => void;
  partialPayment: number | null;
  onPartialPayment: (amount: number | null) => void;
  blockers: CheckoutBlocker[];
  error: string;
  submitting: boolean;
  onConfirm: () => void;
  onBack: () => void;
  onEditSubtotal: () => void;
}) {
  const t = useTranslations("sales.pos");
  const tDash = useTranslations("dashboard");
  const tenderedRef = useRef<HTMLInputElement>(null);
  const customerRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Focus follows the method: type the cash received, search the customer, or just press Enter
  useEffect(() => {
    const timer = setTimeout(() => {
      if (method === "cash") {
        tenderedRef.current?.focus();
        tenderedRef.current?.select();
      } else if (method === "credit" && customerRef.current) customerRef.current.focus();
      else confirmRef.current?.focus();
    }, 0);
    return () => clearTimeout(timer);
  }, [method, customer]);

  const blocked = blockers.length > 0;

  return (
    <div className="flex h-full flex-col bg-gray-50 animate-in fade-in slide-in-from-right-2 duration-200">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-white px-4 py-3 md:px-6">
        {header}
        <p className="hidden text-[11px] text-gray-400 lg:block">{t("checkoutHint")}</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto grid w-full max-w-5xl gap-4 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] md:gap-6 md:p-6">
          {/* ── Summary ── */}
          <section className="flex min-h-0 flex-col rounded-3xl border border-gray-200 bg-white shadow-sm md:max-h-[calc(100vh-13rem)]">
            <div className="border-b border-gray-100 px-6 pt-6 pb-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">{t("toCharge")}</p>
              <p className="mt-1 text-5xl font-black tracking-tight text-gray-900 tabular-nums">
                {formatCurrency(total)}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500">
                <span>{t("itemsCount", { count: cart.length })}</span>
                {subtotalOverride && (
                  <span className="text-blue-700">
                    {t("adjustedTotal", { reason: subtotalOverride.reason })} ·{" "}
                    <span className="line-through text-gray-400 tabular-nums">{formatCurrency(subtotal)}</span>
                  </span>
                )}
                <button
                  type="button"
                  onClick={onEditSubtotal}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold text-gray-500 hover:bg-blue-50 hover:text-blue-600"
                >
                  <Pencil size={11} />
                  {t("editSubtotal")}
                </button>
              </div>
            </div>

            <ul className="flex-1 divide-y divide-gray-100 overflow-y-auto px-6 py-2">
              {cart.map((item) => {
                const pricing = pricingOf(item);
                const qty =
                  item.unitType === "gram"
                    ? `${formatNumber(toSaleUnits(item.quantity, item.unitType), 3)} kg`
                    : `${formatNumber(item.quantity)} ${tDash(`unitAbbr.${item.unitType}`)}`;
                return (
                  <li key={item.itemId} className="flex items-baseline gap-3 py-2.5 text-sm">
                    <span className="w-16 shrink-0 text-xs font-semibold text-gray-400 tabular-nums">{qty}</span>
                    <span className="min-w-0 flex-1 truncate text-gray-800" title={item.name}>
                      {item.name}
                    </span>
                    <span className="shrink-0 font-semibold text-gray-900 tabular-nums">
                      {formatCurrency(pricing.effectiveSubtotal)}
                    </span>
                  </li>
                );
              })}
            </ul>

            <div className="border-t border-gray-100 px-4 py-3">
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900"
              >
                <ArrowLeft size={15} />
                {t("backToProducts")}
                <kbd className="ml-1 hidden md:inline rounded border border-gray-200 px-1 font-mono text-[10px] text-gray-400">
                  Esc
                </kbd>
              </button>
            </div>
          </section>

          {/* ── Payment ── */}
          <section className="flex flex-col gap-4 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm md:p-6">
            <h2 className="text-lg font-bold text-gray-900">{t("howToPay")}</h2>
            <PaymentTiles value={method} onChange={onMethod} />

            {method === "cash" && <CashTender ref={tenderedRef} total={total} tendered={tendered} onChange={onTendered} />}
            {method === "credit" && (
              <CreditCustomer
                ref={customerRef}
                customer={customer}
                onCustomer={onCustomer}
                partialPayment={partialPayment}
                onPartialPayment={onPartialPayment}
              />
            )}
            {method === "internal" && (
              <div className="flex items-start gap-3 rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 animate-in fade-in slide-in-from-top-1">
                <Crown size={18} className="mt-0.5 shrink-0 text-purple-500" />
                <div>
                  <p className="text-sm font-bold text-purple-900">{t("ownerWithdrawal")}</p>
                  <p className="text-xs leading-snug text-purple-700">{t("ownerWithdrawalDesc")}</p>
                </div>
              </div>
            )}

            <div className="mt-auto space-y-2 pt-2">
              {(error || blocked) && (
                <p
                  role="status"
                  className={`rounded-lg px-3 py-2 text-center text-xs font-medium ${
                    error ? "bg-red-50 text-red-600" : "bg-gray-50 text-gray-500"
                  }`}
                >
                  {error || t(`blocked.${blockers[0]}`)}
                </p>
              )}
              <button
                ref={confirmRef}
                onClick={onConfirm}
                disabled={blocked || submitting}
                className={`flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-bold text-white shadow-lg transition-all active:scale-[0.98] disabled:bg-gray-100 disabled:text-gray-400 disabled:shadow-none ${
                  method === "internal"
                    ? "bg-purple-600 shadow-purple-600/20 hover:bg-purple-700"
                    : "bg-green-600 shadow-green-600/20 hover:bg-green-700"
                }`}
              >
                {submitting && <Loader2 size={18} className="animate-spin" />}
                {submitting
                  ? t("processing")
                  : t(method === "internal" ? "confirmInternal" : "confirmSale", { total: formatCurrency(total) })}
                {!submitting && (
                  <kbd className="ml-1 hidden md:inline rounded border border-current/30 px-1.5 font-mono text-[10px] font-medium opacity-80">
                    Enter
                  </kbd>
                )}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
