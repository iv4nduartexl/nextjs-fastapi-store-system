"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Hash,
  AlertCircle,
  CheckCircle2,
  DollarSign,
  X,
  Banknote,
  CreditCard,
  ArrowRightLeft,
  Receipt,
  Wallet,
  ShieldAlert,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  CustomerDetailRead,
  CustomerPaymentCreate,
  recordPayment,
  updateCustomer,
} from "@/components/actions/customers-action";
import type { SaleRead } from "@/components/actions/sales-action";
import { formatCurrency } from "@/lib/currency";
import { formatNumber } from "@/lib/format-number";

const PAYMENT_METHODS: {
  value: "cash" | "card" | "transfer";
  icon: React.ElementType;
}[] = [
  { value: "cash", icon: Banknote },
  { value: "card", icon: CreditCard },
  { value: "transfer", icon: ArrowRightLeft },
];

interface Props {
  customer: CustomerDetailRead;
  locale: string;
}

export default function CustomerDetailClient({ customer, locale }: Props) {
  const t = useTranslations("customers");
  const tSales = useTranslations("sales");

  const [paymentModal, setPaymentModal] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<"cash" | "card" | "transfer">(
    "cash",
  );
  const [payNotes, setPayNotes] = useState("");
  const [paySubmitting, setPaySubmitting] = useState(false);
  const [payError, setPayError] = useState("");
  const [localCustomer, setLocalCustomer] = useState(customer);

  const balance = parseFloat(localCustomer.balance);
  const totalCredit = parseFloat(localCustomer.total_credit);
  const totalPaid = parseFloat(localCustomer.total_paid);
  const limit = localCustomer.credit_limit
    ? parseFloat(localCustomer.credit_limit)
    : null;
  const isOverLimit = limit !== null && balance > limit;
  const limitPct = limit ? Math.min(100, (balance / limit) * 100) : 0;
  const amountNum = parseFloat(payAmount || "0");

  async function handlePayment() {
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) {
      setPayError("Enter a valid amount.");
      return;
    }
    if (amount > balance) {
      setPayError(`Amount cannot exceed the outstanding balance.`);
      return;
    }
    if (amount > balance) {
      setPayError(
        `Cannot exceed the outstanding balance (${formatCurrency(balance)}).`,
      );
      return;
    }
    setPaySubmitting(true);
    setPayError("");

    const result = await recordPayment(localCustomer.id, {
      amount,
      payment_method: payMethod,
      notes: payNotes.trim() || undefined,
    });

    setPaySubmitting(false);
    if (result.error) {
      setPayError(result.error);
    } else if (result.data) {
      // Optimistically update local state
      const newPaid = totalPaid + amount;
      const newBalance = totalCredit - newPaid;
      setLocalCustomer((prev) => ({
        ...prev,
        total_paid: String(newPaid.toFixed(2)),
        balance: String(newBalance.toFixed(2)),
        payments: [result.data!, ...prev.payments],
      }));
      setPaymentModal(false);
      setPayAmount("");
      setPayNotes("");
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Back */}
      <div>
        <Link
          href="/customers"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors mb-4"
        >
          <ArrowLeft size={15} />
          {t("detail.back")}
        </Link>

        {/* Header row */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gray-900 flex items-center justify-center shrink-0 text-white text-xl font-black">
              {localCustomer.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 leading-tight">
                {localCustomer.name}
              </h1>
              {localCustomer.id_number && (
                <p className="text-xs text-gray-400 font-mono mt-0.5">
                  {localCustomer.id_number}
                </p>
              )}
            </div>
          </div>
          <Button
            onClick={() => setPaymentModal(true)}
            disabled={balance <= 0}
            className="bg-gray-900 hover:bg-gray-800 text-white font-semibold h-9 px-4 text-sm rounded-xl disabled:opacity-40"
          >
            <Wallet size={15} className="mr-1.5" />
            {t("detail.recordPayment")}
          </Button>
        </div>
      </div>

      {/* Balance + credit limit bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Outstanding balance – big card */}
        <div
          className={`col-span-2 rounded-2xl border shadow-sm p-5 ${isOverLimit ? "bg-red-50 border-red-200" : "bg-white border-gray-100"}`}
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
              {t("detail.balance")}
            </p>
            {isOverLimit && (
              <span className="flex items-center gap-1 text-[9px] font-bold text-red-600 bg-red-100 border border-red-200 px-1.5 py-0.5 rounded-full">
                <ShieldAlert size={9} />
                {t("detail.overLimit")}
              </span>
            )}
          </div>
          <p
            className={`text-4xl font-black tabular-nums ${balance > 0 ? "text-red-600" : "text-gray-400"}`}
          >
            {formatCurrency(balance)}
          </p>
          {limit !== null && (
            <div className="mt-3 space-y-1">
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${isOverLimit ? "bg-red-500" : limitPct > 75 ? "bg-amber-400" : "bg-green-400"}`}
                  style={{ width: `${limitPct}%` }}
                />
              </div>
              <p className="text-xs text-gray-400">
                {formatCurrency(balance)} / {formatCurrency(limit)}{" "}
                {t("detail.creditLimit").toLowerCase()}
              </p>
            </div>
          )}
        </div>

        {/* Total credit */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">
            {t("detail.totalCredit")}
          </p>
          <p className="text-xl font-black tabular-nums text-gray-700">
            {formatCurrency(totalCredit)}
          </p>
        </div>

        {/* Total paid */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">
            {t("detail.totalPaid")}
          </p>
          <p className="text-xl font-black tabular-nums text-green-600">
            {formatCurrency(totalPaid)}
          </p>
        </div>
      </div>

      {/* Contact info */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">
          {t("detail.contact")}
        </p>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2 text-gray-600">
            <Phone size={13} className="text-gray-400 shrink-0" />
            {localCustomer.phone ?? (
              <span className="text-gray-300">{t("detail.noPhone")}</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-gray-600">
            <Mail size={13} className="text-gray-400 shrink-0" />
            {localCustomer.email ?? (
              <span className="text-gray-300">{t("detail.noEmail")}</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-gray-600 col-span-2">
            <MapPin size={13} className="text-gray-400 shrink-0" />
            {localCustomer.address ?? (
              <span className="text-gray-300">{t("detail.noAddress")}</span>
            )}
          </div>
          {localCustomer.credit_limit && (
            <div className="flex items-center gap-2 text-gray-600">
              <CreditCard size={13} className="text-gray-400 shrink-0" />
              {t("detail.creditLimit")}:{" "}
              {formatCurrency(localCustomer.credit_limit)}
            </div>
          )}
        </div>
        {localCustomer.notes && (
          <div className="mt-3 pt-3 border-t border-gray-100 text-sm text-gray-600">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">
              {t("detail.notes")}
            </p>
            {localCustomer.notes}
          </div>
        )}
      </div>

      {/* Credit Sales */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <Receipt size={15} className="text-gray-400" />
          <h2 className="font-semibold text-gray-800 text-sm">
            {t("detail.creditSales")}
          </h2>
          <span className="ml-auto text-xs text-gray-400 font-mono">
            {localCustomer.credit_sales.length}
          </span>
        </div>
        {localCustomer.credit_sales.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-10">
            {t("detail.noCreditSales")}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  {t("detail.saleDate")}
                </th>
                <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  {t("detail.saleItems")}
                </th>
                <th className="text-right px-5 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  {t("detail.saleTotal")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {localCustomer.credit_sales.map((sale: SaleRead) => (
                <tr
                  key={sale.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-5 py-3">
                    <Link
                      href={`/sales/${sale.id}`}
                      className="hover:underline text-gray-700"
                    >
                      {new Date(sale.created_at).toLocaleDateString(locale, {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </Link>
                    <p className="text-[10px] text-gray-400 font-mono">
                      #{sale.id.split("-")[0].toUpperCase()}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">
                    {sale.sale_items.length}
                  </td>
                  <td className="px-5 py-3 text-right font-mono font-bold tabular-nums text-gray-800">
                    {formatCurrency(sale.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Payment History */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <CheckCircle2 size={15} className="text-green-500" />
          <h2 className="font-semibold text-gray-800 text-sm">
            {t("detail.payments")}
          </h2>
          <span className="ml-auto text-xs text-gray-400 font-mono">
            {localCustomer.payments.length}
          </span>
        </div>
        {localCustomer.payments.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-10">
            {t("detail.noPayments")}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  {t("detail.paymentDate")}
                </th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  {t("detail.paymentMethodLabel")}
                </th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider hidden sm:table-cell">
                  {t("detail.paymentNotes")}
                </th>
                <th className="text-right px-5 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  {t("detail.paymentAmount2")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {localCustomer.payments.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 text-gray-600">
                    {new Date(p.payment_date).toLocaleDateString(locale, {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md capitalize">
                      {t(`paymentMethod.${p.payment_method}` as any)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400 hidden sm:table-cell">
                    {p.notes ?? "—"}
                  </td>
                  <td className="px-5 py-3 text-right font-mono font-bold tabular-nums text-green-600">
                    +{formatCurrency(p.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Record Payment Modal */}
      {paymentModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPaymentModal(false);
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Wallet size={16} className="text-green-600" />
                <h3 className="font-semibold text-gray-800">
                  {t("detail.recordPayment")}
                </h3>
              </div>
              <button
                onClick={() => setPaymentModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={16} />
              </button>
            </div>

            {/* Customer + balance reminder */}
            <div className="px-5 pt-4 pb-0">
              <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3 mb-4">
                <div>
                  <p className="text-xs text-gray-400">{t("detail.balance")}</p>
                  <p className="text-2xl font-black tabular-nums text-red-600">
                    {formatCurrency(balance)}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-gray-900 flex items-center justify-center text-white font-black">
                  {localCustomer.name.charAt(0).toUpperCase()}
                </div>
              </div>
            </div>

            <div className="px-5 pb-5 space-y-4">
              {/* Amount */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    className={`text-xs font-semibold ${amountNum > balance ? "text-red-600" : "text-gray-600"}`}
                  >
                    {amountNum > balance
                      ? `${t("detail.paymentMaxHint")} ${formatCurrency(balance)}`
                      : t("detail.paymentAmount")}
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setPayAmount(String(Math.floor(balance)));
                    }
                    className="text-[10px] font-bold text-green-600 hover:text-green-700 bg-green-50 hover:bg-green-100 px-2 py-0.5 rounded-md transition-colors"
                  >
                    {t("detail.payFull")} {formatCurrency(balance)}
                  </button>
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  autoFocus
                  value={formatNumber(payAmount)}
                  onChange={(e) => {
                    setPayAmount(e.target.value.replace(/\D/g, ""));
                  }}
                  placeholder="0"
                  className={`w-full h-12 text-2xl font-bold text-right rounded-xl border px-4 font-mono focus:outline-none focus:ring-2 transition-colors ${
                    amountNum > balance
                      ? "border-red-400 bg-red-50 text-red-600 focus:ring-red-200"
                      : "border-gray-200 bg-gray-50 text-gray-900 focus:ring-gray-300"
                  }`}
                />
              </div>

              {/* Method */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-600">
                  {t("detail.paymentMethod")}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {PAYMENT_METHODS.map(({ value, icon: Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setPayMethod(value)}
                      className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border-2 text-xs font-semibold transition-all ${
                        payMethod === value
                          ? "border-green-500 bg-green-50 text-green-700"
                          : "border-gray-200 text-gray-500 hover:border-gray-300"
                      }`}
                    >
                      <Icon size={16} />
                      {t(`paymentMethod.${value}`)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-600">
                  {t("detail.paymentNotes")}
                </label>
                <Input
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder={t("detail.paymentNotesPlaceholder")}
                  className="h-9 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handlePayment();
                  }}
                />
              </div>

              {payError && (
                <p className="text-red-500 text-xs bg-red-50 rounded-lg px-3 py-2">
                  {payError}
                </p>
              )}
            </div>

            <div className="px-5 py-4 border-t border-gray-100 bg-white rounded-b-2xl">
              <Button
                onClick={handlePayment}
                disabled={paySubmitting || !payAmount || amountNum > balance}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold h-11"
              >
                {paySubmitting
                  ? t("detail.paymentSubmitting")
                  : t("detail.paymentSubmit")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
