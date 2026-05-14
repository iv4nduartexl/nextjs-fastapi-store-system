"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  AlertCircle,
  X,
  Banknote,
  CreditCard,
  ArrowRightLeft,
  Wallet,
  ShieldAlert,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  CustomerDetailRead,
  deleteOutcome,
  deletePayment,
  recordPayment,
  recordOutcome,
} from "@/components/actions/customers-action";
import { cancelCreditSale } from "@/components/actions/sales-action";
import { formatCurrency } from "@/lib/currency";
import { formatNumber } from "@/lib/format-number";
import LocalDateSpan from "@/lib/LocalDateSpan";

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

  const [paymentModal, setPaymentModal] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<"cash" | "card" | "transfer">(
    "cash",
  );
  const [payNotes, setPayNotes] = useState("");
  const [paySubmitting, setPaySubmitting] = useState(false);
  const [payError, setPayError] = useState("");
  const [outcomeModal, setOutcomeModal] = useState(false);
  const [outcomeAmount, setOutcomeAmount] = useState("");
  const [outcomeDesc, setOutcomeDesc] = useState("");
  const [outcomeSubmitting, setOutcomeSubmitting] = useState(false);
  const [outcomeError, setOutcomeError] = useState("");
  const [rowActionPendingId, setRowActionPendingId] = useState<string | null>(
    null,
  );
  const [rowActionError, setRowActionError] = useState("");
  const [localCustomer, setLocalCustomer] = useState(customer);

  const balance = parseFloat(localCustomer.balance);
  const totalCredit = parseFloat(localCustomer.total_credit);
  const totalOutcomes = parseFloat(
    (localCustomer as any).total_outcomes ?? "0",
  );
  const totalPaid = parseFloat(localCustomer.total_paid);
  const limit = localCustomer.credit_limit
    ? parseFloat(localCustomer.credit_limit)
    : null;
  const isOverLimit = limit !== null && balance > limit;
  const limitPct = limit ? Math.min(100, (balance / limit) * 100) : 0;
  const amountNum = parseFloat(payAmount || "0");
  const outcomeAmountNum = parseFloat(outcomeAmount || "0");
  const [activeTab, setActiveTab] = useState<"products" | "audit">("audit");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [typeFilter, setTypeFilter] = useState<
    "all" | "payment" | "sale" | "outcome"
  >("all");
  const [productsPage, setProductsPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const itemsPerPage = 25;

  const sales = localCustomer.credit_sales ?? [];
  const payments = localCustomer.payments ?? [];
  const outcomes = localCustomer.outcomes ?? [];


  function inRange(dateValue: string) {
    const current = new Date(dateValue);
    if (dateFrom) {
      const from = new Date(`${dateFrom}T00:00:00`);
      if (current < from) return false;
    }
    if (dateTo) {
      const to = new Date(`${dateTo}T23:59:59.999`);
      if (current > to) return false;
    }
    return true;
  }

  const filteredSales = [...sales]
    .filter((sale) => inRange(sale.created_at))
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  const filteredPayments = [...payments]
    .filter((payment) => inRange(payment.payment_date))
    .sort(
      (a, b) =>
        new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime(),
    );
  const filteredOutcomes = [...outcomes]
    .filter((outcome) => inRange(outcome.outcome_date))
    .sort(
      (a, b) =>
        new Date(b.outcome_date).getTime() - new Date(a.outcome_date).getTime(),
    );

  const productRows = filteredSales
    .flatMap((sale) =>
      sale.sale_items.map((item) => ({
        saleId: sale.id,
        date: sale.created_at,
        itemName: item.item_name,
        qty: parseFloat(item.quantity),
        unitPrice: parseFloat(item.unit_price),
        subtotal: parseFloat(item.subtotal),
      })),
    )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const productsAmountTotal = productRows.reduce(
    (sum, row) => sum + row.subtotal,
    0,
  );
  const productsQtyTotal = productRows.reduce((sum, row) => sum + row.qty, 0);

  const salesAmountTotal = filteredSales.reduce(
    (sum, sale) => sum + parseFloat(sale.total),
    0,
  );
  const paymentsAmountTotal = filteredPayments.reduce(
    (sum, payment) => sum + parseFloat(payment.amount),
    0,
  );
  const outcomesAmountTotal = filteredOutcomes.reduce(
    (sum, outcome) => sum + parseFloat(outcome.amount),
    0,
  );
  const netMovement =
    salesAmountTotal + outcomesAmountTotal - paymentsAmountTotal;

  const allAuditRows = [
    ...filteredSales.map((sale) => ({
      id: `sale-${sale.id}`,
      date: sale.created_at,
      type: "sale" as const,
      label: t("detail.auditCreditSale"),
      description: `#${sale.id.split("-")[0].toUpperCase()} · ${sale.sale_items.length} ${t("detail.saleItems").toLowerCase()}`,
      amount: parseFloat(sale.total),
    })),
    ...filteredPayments.map((payment) => ({
      id: `payment-${payment.id}`,
      date: payment.payment_date,
      type: "payment" as const,
      label: t("detail.auditPayment"),
      description: payment.notes || t("detail.paymentMethodLabel"),
      amount: -parseFloat(payment.amount),
    })),
    ...filteredOutcomes.map((outcome) => ({
      id: `outcome-${outcome.id}`,
      date: outcome.outcome_date,
      type: "outcome" as const,
      label: t("detail.auditOutcome"),
      description: outcome.description,
      amount: parseFloat(outcome.amount),
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const filteredAuditRows =
    typeFilter === "all"
      ? allAuditRows
      : allAuditRows.filter((row) => row.type === typeFilter);

  // Pagination
  const productsTotalPages = Math.ceil(productRows.length / itemsPerPage);
  const auditTotalPages = Math.ceil(filteredAuditRows.length / itemsPerPage);

  const paginatedProducts = productRows.slice(
    (productsPage - 1) * itemsPerPage,
    productsPage * itemsPerPage,
  );

  const paginatedAudit = filteredAuditRows.slice(
    (auditPage - 1) * itemsPerPage,
    auditPage * itemsPerPage,
  );

  async function handlePayment() {
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) {
      setPayError("Enter a valid amount.");
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
      const newBalance = totalCredit + totalOutcomes - newPaid;
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

  async function handleOutcome() {
    const amount = parseFloat(outcomeAmount);
    if (!amount || amount <= 0) {
      setOutcomeError("Enter a valid amount.");
      return;
    }
    if (!outcomeDesc.trim()) {
      setOutcomeError("Description is required.");
      return;
    }

    setOutcomeSubmitting(true);
    setOutcomeError("");
    const result = await recordOutcome(localCustomer.id, {
      amount,
      description: outcomeDesc.trim(),
    });
    setOutcomeSubmitting(false);

    if (result.error) {
      setOutcomeError(result.error);
    } else if (result.data) {
      const newOutcomes = totalOutcomes + amount;
      const newBalance = totalCredit + newOutcomes - totalPaid;
      setLocalCustomer((prev) => ({
        ...prev,
        total_outcomes: String(newOutcomes.toFixed(2)),
        balance: String(newBalance.toFixed(2)),
        outcomes: [result.data!, ...prev.outcomes],
      }));
      setOutcomeModal(false);
      setOutcomeAmount("");
      setOutcomeDesc("");
    }
  }

  async function handleDeletePayment(paymentId: string) {
    if (!confirm(t("detail.confirmDeletePayment"))) return;

    setRowActionPendingId(`payment-${paymentId}`);
    setRowActionError("");
    const result = await deletePayment(localCustomer.id, paymentId);
    setRowActionPendingId(null);

    if (result.error) {
      setRowActionError(result.error);
      return;
    }

    setLocalCustomer((prev) => {
      const nextPayments = prev.payments.filter((p) => p.id !== paymentId);
      const nextTotalPaid = nextPayments.reduce(
        (sum, p) => sum + parseFloat(p.amount),
        0,
      );
      const prevTotalCredit = parseFloat(prev.total_credit);
      const prevTotalOutcomes = parseFloat((prev as any).total_outcomes ?? "0");
      const nextBalance = prevTotalCredit + prevTotalOutcomes - nextTotalPaid;

      return {
        ...prev,
        payments: nextPayments,
        total_paid: nextTotalPaid.toFixed(2),
        balance: nextBalance.toFixed(2),
      };
    });
  }

  async function handleDeleteOutcome(outcomeId: string) {
    if (!confirm(t("detail.confirmDeleteOutcome"))) return;

    setRowActionPendingId(`outcome-${outcomeId}`);
    setRowActionError("");
    const result = await deleteOutcome(localCustomer.id, outcomeId);
    setRowActionPendingId(null);

    if (result.error) {
      setRowActionError(result.error);
      return;
    }

    setLocalCustomer((prev) => {
      const nextOutcomes = prev.outcomes.filter((o) => o.id !== outcomeId);
      const nextTotalOutcomes = nextOutcomes.reduce(
        (sum, o) => sum + parseFloat(o.amount),
        0,
      );
      const prevTotalCredit = parseFloat(prev.total_credit);
      const prevTotalPaid = parseFloat(prev.total_paid);
      const nextBalance = prevTotalCredit + nextTotalOutcomes - prevTotalPaid;

      return {
        ...prev,
        outcomes: nextOutcomes,
        total_outcomes: nextTotalOutcomes.toFixed(2),
        balance: nextBalance.toFixed(2),
      };
    });
  }

  async function handleUndoSale(saleId: string) {
    if (!confirm(t("detail.confirmUndoSale"))) return;

    setRowActionPendingId(`sale-${saleId}`);
    setRowActionError("");
    const result = await cancelCreditSale(saleId);
    setRowActionPendingId(null);

    if (result.error) {
      setRowActionError(result.error);
      return;
    }

    setLocalCustomer((prev) => {
      const nextSales = prev.credit_sales.filter((s) => s.id !== saleId);
      const nextTotalCredit = nextSales.reduce(
        (sum, s) => sum + parseFloat(s.total),
        0,
      );
      const prevTotalOutcomes = parseFloat((prev as any).total_outcomes ?? "0");
      const prevTotalPaid = parseFloat(prev.total_paid);
      const nextBalance = nextTotalCredit + prevTotalOutcomes - prevTotalPaid;

      return {
        ...prev,
        credit_sales: nextSales,
        total_credit: nextTotalCredit.toFixed(2),
        balance: nextBalance.toFixed(2),
      };
    });
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
          <div className="flex items-center gap-2">
            <Button
              onClick={() => {
                setOutcomeModal(true);
                setOutcomeError("");
              }}
              className="bg-amber-500 hover:bg-amber-600 text-white font-semibold h-9 px-4 text-sm rounded-xl"
            >
              <AlertCircle size={15} className="mr-1.5" />
              {t("detail.recordOutcome")}
            </Button>
            <Button
              onClick={() => {
                setPaymentModal(true);
                setPayError("");
              }}
              disabled={balance <= 0}
              className="bg-gray-900 hover:bg-gray-800 text-white font-semibold h-9 px-4 text-sm rounded-xl disabled:opacity-40"
            >
              <Wallet size={15} className="mr-1.5" />
              {t("detail.recordPayment")}
            </Button>
          </div>
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
            {formatCurrency(totalCredit + totalOutcomes)}
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

      {/* Audit workspace */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="font-semibold text-gray-800 text-sm">
              {t("detail.auditWorkspace")}
            </h2>
            <div className="flex items-center gap-1 rounded-xl bg-gray-100 p-1">
              <button
                onClick={() => setActiveTab("audit")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  activeTab === "audit"
                    ? "bg-white text-gray-800 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {t("detail.auditTab")}
              </button>
              <button
                onClick={() => setActiveTab("products")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  activeTab === "products"
                    ? "bg-white text-gray-800 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {t("detail.productsTab")}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                {t("detail.dateFrom")}
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setProductsPage(1);
                  setAuditPage(1);
                }}
                className="w-full h-9 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                {t("detail.dateTo")}
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setProductsPage(1);
                  setAuditPage(1);
                }}
                className="w-full h-9 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDateFrom("");
                  setDateTo("");
                  setProductsPage(1);
                  setAuditPage(1);
                  setTypeFilter("all");
                }}
                className="w-full h-9"
              >
                {t("detail.clearDateFilter")}
              </Button>
            </div>
          </div>

          {activeTab === "audit" && (
            <div className="pt-2 flex flex-wrap gap-1.5">
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mr-1 flex items-center">
                {t("detail.typeFilter")}:
              </label>
              <button
                onClick={() => {
                  setTypeFilter("all");
                  setAuditPage(1);
                }}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  typeFilter === "all"
                    ? "bg-gray-800 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {t("detail.typeFilterAll")}
              </button>
              <button
                onClick={() => {
                  setTypeFilter("sale");
                  setAuditPage(1);
                }}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  typeFilter === "sale"
                    ? "bg-gray-800 text-white"
                    : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                }`}
              >
                {t("detail.auditCreditSale")}
              </button>
              <button
                onClick={() => {
                  setTypeFilter("payment");
                  setAuditPage(1);
                }}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  typeFilter === "payment"
                    ? "bg-green-100 text-green-700"
                    : "bg-green-50 text-green-600 hover:bg-green-100"
                }`}
              >
                {t("detail.auditPayment")}
              </button>
              <button
                onClick={() => {
                  setTypeFilter("outcome");
                  setAuditPage(1);
                }}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  typeFilter === "outcome"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-amber-50 text-amber-600 hover:bg-amber-100"
                }`}
              >
                {t("detail.auditOutcome")}
              </button>
            </div>
          )}
        </div>

        <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-4 gap-3 border-b border-gray-100 bg-gray-50">
          <div className="rounded-xl bg-white border border-gray-100 p-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
              {t("detail.filteredSales")}
            </p>
            <p className="text-sm font-black text-gray-700 mt-1">
              {formatCurrency(salesAmountTotal)}
            </p>
          </div>
          <div className="rounded-xl bg-white border border-gray-100 p-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
              {t("detail.filteredPayments")}
            </p>
            <p className="text-sm font-black text-green-600 mt-1">
              {formatCurrency(paymentsAmountTotal)}
            </p>
          </div>
          <div className="rounded-xl bg-white border border-gray-100 p-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
              {t("detail.filteredOutcomes")}
            </p>
            <p className="text-sm font-black text-amber-600 mt-1">
              {formatCurrency(outcomesAmountTotal)}
            </p>
          </div>
          <div className="rounded-xl bg-white border border-gray-100 p-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
              {t("detail.filteredNet")}
            </p>
            <p
              className={`text-sm font-black mt-1 ${netMovement >= 0 ? "text-red-600" : "text-green-600"}`}
            >
              {netMovement >= 0 ? "+" : "-"}
              {formatCurrency(Math.abs(netMovement))}
            </p>
          </div>
        </div>

        {rowActionError && (
          <div className="px-5 py-2.5 border-b border-red-100 bg-red-50">
            <p className="text-xs text-red-600">{rowActionError}</p>
          </div>
        )}

        {activeTab === "products" ? (
          productRows.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-12">
              {t("detail.noProductsInRange")}
            </p>
          ) : (
            <>
              <div className="px-5 py-2.5 text-xs text-gray-500 flex flex-wrap items-center gap-4 border-b border-gray-100">
                <span>
                  {t("detail.rows")} {productRows.length}
                </span>
                <span>
                  {t("detail.qty")} {formatNumber(productsQtyTotal)}
                </span>
                <span>
                  {t("detail.saleTotal")} {formatCurrency(productsAmountTotal)}
                </span>
                <span>
                  {t("detail.page")} {productsPage} {t("detail.of")}{" "}
                  {productsTotalPages}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[780px]">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-5 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                        {t("detail.saleDate")}
                      </th>
                      <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                        {t("detail.product")}
                      </th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                        {t("detail.qty")}
                      </th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                        {t("detail.unitPrice")}
                      </th>
                      <th className="text-right px-5 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                        {t("detail.saleTotal")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {paginatedProducts.map((row, idx) => (
                      <tr
                        key={`${row.saleId}-${row.itemName}-${idx}`}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        <td className="px-5 py-3 text-gray-600">
                          <Link
                            href={`/sales/${row.saleId}`}
                            className="hover:underline"
                          >
                            <LocalDateSpan
                              dateIso={row.date}
                              locale={locale}
                              options={{
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              }}
                            />
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {row.itemName}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-gray-600">
                          {formatNumber(row.qty, row.qty % 1 === 0 ? 0 : 3)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-gray-600">
                          {formatCurrency(row.unitPrice)}
                        </td>
                        <td className="px-5 py-3 text-right font-mono font-bold text-gray-800">
                          {formatCurrency(row.subtotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {productsTotalPages > 1 && (
                <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setProductsPage(Math.max(1, productsPage - 1))
                    }
                    disabled={productsPage === 1}
                    className="h-8 px-3 text-xs"
                  >
                    {t("detail.previous")}
                  </Button>
                  <span className="text-xs text-gray-500">
                    {t("detail.page")} {productsPage} {t("detail.of")}{" "}
                    {productsTotalPages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setProductsPage(
                        Math.min(productsTotalPages, productsPage + 1),
                      )
                    }
                    disabled={productsPage === productsTotalPages}
                    className="h-8 px-3 text-xs"
                  >
                    {t("detail.next")}
                  </Button>
                </div>
              )}
            </>
          )
        ) : filteredAuditRows.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-12">
            {t("detail.noAuditInRange")}
          </p>
        ) : (
          <>
            <div className="px-5 py-2.5 text-xs text-gray-500 flex flex-wrap items-center gap-4 border-b border-gray-100">
              <span>
                {t("detail.rows")} {filteredAuditRows.length}
              </span>
              <span>
                {t("detail.page")} {auditPage} {t("detail.of")}{" "}
                {auditTotalPages}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-5 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                      {t("detail.saleDate")}
                    </th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                      {t("detail.event")}
                    </th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                      {t("detail.description")}
                    </th>
                    <th className="text-right px-5 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                      {t("detail.amount")}
                    </th>
                    <th className="text-right px-5 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                      {t("detail.actions")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paginatedAudit.map((row) => (
                    <tr
                      key={row.id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-5 py-3 text-gray-600">
                        {row.type === "sale" ? (
                          <Link
                            href={`/sales/${row.id.replace("sale-", "")}`}
                            className="hover:underline text-gray-700"
                          >
                            <LocalDateSpan
                              dateIso={row.date}
                              locale={locale}
                              options={{
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              }}
                            />
                          </Link>
                        ) : (
                          <span className="text-gray-700">
                            <LocalDateSpan
                              dateIso={row.date}
                              locale={locale}
                              options={{
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              }}
                            />
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded-md ${
                            row.type === "payment"
                              ? "bg-green-100 text-green-700"
                              : row.type === "outcome"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {row.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {row.description}
                      </td>
                      <td
                        className={`px-5 py-3 text-right font-mono font-bold ${row.amount < 0 ? "text-green-600" : "text-red-600"}`}
                      >
                        {row.amount < 0 ? "-" : "+"}
                        {formatCurrency(Math.abs(row.amount))}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {row.type === "sale" ? (
                          <button
                            type="button"
                            onClick={() =>
                              handleUndoSale(row.id.replace("sale-", ""))
                            }
                            disabled={rowActionPendingId === row.id}
                            className="text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-50"
                          >
                            {rowActionPendingId === row.id
                              ? t("detail.undoing")
                              : t("detail.undoSale")}
                          </button>
                        ) : row.type === "payment" ? (
                          <button
                            type="button"
                            onClick={() =>
                              handleDeletePayment(
                                row.id.replace("payment-", ""),
                              )
                            }
                            disabled={rowActionPendingId === row.id}
                            className="text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-50"
                          >
                            {rowActionPendingId === row.id
                              ? t("detail.deleting")
                              : t("detail.delete")}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              handleDeleteOutcome(
                                row.id.replace("outcome-", ""),
                              )
                            }
                            disabled={rowActionPendingId === row.id}
                            className="text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-50"
                          >
                            {rowActionPendingId === row.id
                              ? t("detail.deleting")
                              : t("detail.delete")}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {auditTotalPages > 1 && (
              <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAuditPage(Math.max(1, auditPage - 1))}
                  disabled={auditPage === 1}
                  className="h-8 px-3 text-xs"
                >
                  {t("detail.previous")}
                </Button>
                <span className="text-xs text-gray-500">
                  {t("detail.page")} {auditPage} {t("detail.of")}{" "}
                  {auditTotalPages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setAuditPage(Math.min(auditTotalPages, auditPage + 1))
                  }
                  disabled={auditPage === auditTotalPages}
                  className="h-8 px-3 text-xs"
                >
                  {t("detail.next")}
                </Button>
              </div>
            )}
          </>
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
                    onClick={() => setPayAmount(String(Math.floor(balance)))}
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

      {/* Record Outcome Modal */}
      {outcomeModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOutcomeModal(false);
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <AlertCircle size={16} className="text-amber-500" />
                <h3 className="font-semibold text-gray-800">
                  {t("detail.recordOutcome")}
                </h3>
              </div>
              <button
                onClick={() => setOutcomeModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={16} />
              </button>
            </div>

            <div className="px-5 py-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-600">
                  {t("detail.outcomeAmount")}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoFocus
                  value={formatNumber(outcomeAmount)}
                  onChange={(e) => {
                    setOutcomeAmount(e.target.value.replace(/\D/g, ""));
                  }}
                  placeholder="0"
                  className="w-full h-12 text-2xl font-bold text-right rounded-xl border px-4 font-mono focus:outline-none focus:ring-2 transition-colors border-amber-300 bg-amber-50 text-amber-700 focus:ring-amber-200"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-600">
                  {t("detail.outcomeDescription")}
                </label>
                <Input
                  value={outcomeDesc}
                  onChange={(e) => setOutcomeDesc(e.target.value)}
                  placeholder={t("detail.outcomeDescriptionPlaceholder")}
                  className="h-9 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleOutcome();
                  }}
                />
              </div>

              {outcomeError && (
                <p className="text-red-500 text-xs bg-red-50 rounded-lg px-3 py-2">
                  {outcomeError}
                </p>
              )}
            </div>

            <div className="px-5 py-4 border-t border-gray-100 bg-white rounded-b-2xl">
              <Button
                onClick={handleOutcome}
                disabled={
                  outcomeSubmitting ||
                  !outcomeAmount ||
                  !outcomeDesc.trim() ||
                  outcomeAmountNum <= 0
                }
                className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold h-11"
              >
                {outcomeSubmitting
                  ? t("detail.outcomeSubmitting")
                  : t("detail.outcomeSubmit")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
