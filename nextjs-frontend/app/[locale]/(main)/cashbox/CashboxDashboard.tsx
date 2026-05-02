"use client";

import { useState, useEffect, useTransition } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  CreditCard,
  ArrowRightLeft,
  Banknote,
  RefreshCcw,
  ShoppingCart,
  ShoppingBag,
  Users,
  Plus,
  Minus,
  X,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Calendar,
  Clock,
  Lock,
  Unlock,
  BarChart3,
  Crown,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  CashboxSessionRead,
  CashboxTransactionRead,
  openSession,
  closeSession,
  addManualTransaction,
  fetchTransactions,
} from "@/components/actions/cashbox-action";
import { formatCurrency } from "@/lib/currency";
import { formatNumber } from "@/lib/format-number";

type TxFilter = "all" | "in" | "out";

const TX_ICONS: Record<string, React.ElementType> = {
  sale: ShoppingCart,
  purchase: ShoppingBag,
  income: TrendingUp,
  expense: TrendingDown,
  customer_payment: Users,
  opening: Wallet,
  owner_withdrawal: Crown,
};

const METHOD_ICONS: Record<string, React.ElementType> = {
  cash: Banknote,
  card: CreditCard,
  transfer: ArrowRightLeft,
  credit: Users,
  other: RefreshCcw,
};

function formatDuration(from: string): string {
  const ms = Date.now() - new Date(from).getTime();
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function durationBetween(from: string, to: string): string {
  const ms = new Date(to).getTime() - new Date(from).getTime();
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isToday(ds: string) {
  return isSameDay(new Date(ds), new Date());
}

function isYesterday(ds: string) {
  const y = new Date();
  y.setDate(y.getDate() - 1);
  return isSameDay(new Date(ds), y);
}

function isThisWeek(ds: string) {
  return new Date(ds) >= new Date(Date.now() - 7 * 24 * 3_600_000);
}

function groupByDay(txs: CashboxTransactionRead[]) {
  const map = new Map<string, CashboxTransactionRead[]>();
  for (const tx of txs) {
    const key = new Date(tx.created_at).toDateString();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(tx);
  }
  return Array.from(map.entries()).map(([key, items]) => ({ key, items }));
}

interface Props {
  initialSession: CashboxSessionRead | null;
  initialTransactions: CashboxTransactionRead[];
  pastSessions: CashboxSessionRead[];
  locale: string;
}

export default function CashboxDashboard({
  initialSession,
  initialTransactions,
  pastSessions,
  locale,
}: Props) {
  const t = useTranslations("cashbox");
  const [session, setSession] = useState<CashboxSessionRead | null>(
    initialSession,
  );
  const [transactions, setTransactions] =
    useState<CashboxTransactionRead[]>(initialTransactions);
  const [txFilter, setTxFilter] = useState<TxFilter>("all");
  const [, startTransition] = useTransition();

  // ── Open session modal ──
  const [openModal, setOpenModal] = useState(false);
  const [openAmount, setOpenAmount] = useState("");
  const [openNotes, setOpenNotes] = useState("");
  const [openSubmitting, setOpenSubmitting] = useState(false);
  const [openError, setOpenError] = useState("");

  // ── Close session modal ──
  const [closeModal, setCloseModal] = useState(false);
  const [countedAmount, setCountedAmount] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [closeSubmitting, setCloseSubmitting] = useState(false);
  const [closeError, setCloseError] = useState("");

  // ── Manual transaction modal ──
  const [txModal, setTxModal] = useState<"income" | "expense" | null>(null);
  const [txAmount, setTxAmount] = useState("");
  const [txMethod, setTxMethod] = useState("cash");
  const [txDesc, setTxDesc] = useState("");
  const [txSubmitting, setTxSubmitting] = useState(false);
  const [txError, setTxError] = useState("");

  // ── History filter ──
  const [historyFilter, setHistoryFilter] = useState<
    "all" | "today" | "yesterday" | "week" | "custom"
  >("all");
  const [customDate, setCustomDate] = useState<string>("");

  // ── Computed values ──
  const expectedCash = session ? parseFloat(session.expected_cash_balance) : 0;
  const cashIn = session ? parseFloat(session.cash_in) : 0;
  const cashOut = session ? parseFloat(session.cash_out) : 0;
  const cardIn = session ? parseFloat(session.card_in) : 0;
  const transferIn = session ? parseFloat(session.transfer_in) : 0;
  const creditSales = session ? parseFloat(session.credit_sales) : 0;
  const ownerWithdrawals = session ? parseFloat((session as any).owner_withdrawals || 0) : 0;
  const totalRevenue = cashIn + cardIn + transferIn + creditSales;
  const openingAmount = session ? parseFloat(session.opening_amount) : 0;

  const countedNum = parseFloat(countedAmount || "0");
  const difference = session
    ? countedNum - parseFloat(session.expected_cash_balance)
    : 0;

  const filteredTx = transactions.filter((tx) => {
    if (txFilter === "in") return tx.direction === "in";
    if (txFilter === "out") return tx.direction === "out";
    return true;
  });

  const lastClosed = pastSessions.find(
    (s) => s.status === "closed" && s.closing_amount_counted,
  );

  const filteredHistory = pastSessions.filter((s) => {
    if (historyFilter === "today") return isToday(s.opened_at);
    if (historyFilter === "yesterday") return isYesterday(s.opened_at);
    if (historyFilter === "week") return isThisWeek(s.opened_at);
    if (historyFilter === "custom" && customDate) {
      const d = new Date(s.opened_at);
      const y = new Date(customDate + "T00:00:00");
      return isSameDay(d, y);
    }
    return true;
  });

  const txGroups = groupByDay(filteredTx);

  function dateLabel(key: string) {
    const d = new Date(key);
    if (isSameDay(d, new Date())) return t("today");
    const y = new Date();
    y.setDate(y.getDate() - 1);
    if (isSameDay(d, y)) return t("yesterday");
    return d.toLocaleDateString(locale, {
      weekday: "short",
      day: "2-digit",
      month: "short",
    });
  }

  // ── Handlers ──
  async function handleOpenSession() {
    const amount = parseFloat(openAmount || "0");
    setOpenSubmitting(true);
    setOpenError("");
    const result = await openSession({
      opening_amount: amount,
      notes: openNotes.trim() || undefined,
    });
    setOpenSubmitting(false);
    if (result.error) {
      setOpenError(result.error);
      return;
    }
    setSession(result.data!);
    setOpenModal(false);
    setOpenAmount("");
    setOpenNotes("");
    // Fetch transactions for new session
    const txs = await fetchTransactions(result.data!.id, 100);
    setTransactions(txs);
  }

  async function handleCloseSession() {
    if (!session) return;
    setCloseSubmitting(true);
    setCloseError("");
    const result = await closeSession({
      closing_amount_counted: countedNum,
      notes: closeNotes.trim() || undefined,
    });
    setCloseSubmitting(false);
    if (result.error) {
      setCloseError(result.error);
      return;
    }
    setSession(result.data!);
    setCloseModal(false);
    setCountedAmount("");
    setCloseNotes("");
  }

  async function handleManualTx() {
    if (!txModal) return;
    const amount = parseFloat(txAmount || "0");
    if (!amount || amount <= 0) {
      setTxError("Enter a valid amount.");
      return;
    }
    setTxSubmitting(true);
    setTxError("");
    const result = await addManualTransaction({
      type: txModal,
      amount,
      payment_method: txMethod,
      description: txDesc.trim() || undefined,
    });
    setTxSubmitting(false);
    if (result.error) {
      setTxError(result.error);
      return;
    }
    setTransactions((prev) => [result.data!, ...prev]);
    // Update local session stats optimistically
    setSession((prev) => {
      if (!prev) return prev;
      const a = parseFloat(result.data!.amount);
      const cashI =
        txModal === "income" && txMethod === "cash"
          ? parseFloat(prev.cash_in) + a
          : parseFloat(prev.cash_in);
      const cashO =
        txModal === "expense" && txMethod === "cash"
          ? parseFloat(prev.cash_out) + a
          : parseFloat(prev.cash_out);
      const cardI =
        txModal === "income" && txMethod === "card"
          ? parseFloat(prev.card_in) + a
          : parseFloat(prev.card_in);
      const transferI =
        txModal === "income" && txMethod === "transfer"
          ? parseFloat(prev.transfer_in) + a
          : parseFloat(prev.transfer_in);
      const newExpected = parseFloat(prev.opening_amount) + cashI - cashO;
      return {
        ...prev,
        cash_in: String(cashI),
        cash_out: String(cashO),
        card_in: String(cardI),
        transfer_in: String(transferI),
        expected_cash_balance: String(newExpected),
        transaction_count: prev.transaction_count + 1,
      };
    });
    setTxModal(null);
    setTxAmount("");
    setTxDesc("");
    setTxMethod("cash");
  }

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
            <Wallet size={20} className="text-gray-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
            <p className="text-sm text-gray-500">{t("subtitle")}</p>
          </div>
        </div>
        {session?.status === "open" && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setTxModal("income");
                setTxError("");
              }}
              className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white text-sm font-semibold rounded-xl hover:bg-green-700 transition-colors"
            >
              <TrendingUp size={15} />
              {t("addIncome")}
            </button>
            <button
              onClick={() => {
                setTxModal("expense");
                setTxError("");
              }}
              className="flex items-center gap-1.5 px-3 py-2 bg-red-500 text-white text-sm font-semibold rounded-xl hover:bg-red-600 transition-colors"
            >
              <TrendingDown size={15} />
              {t("addExpense")}
            </button>
          </div>
        )}
      </div>

      {/* ── Session status banner ── */}
      {session?.status === "open" ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Green top bar */}
          <div className="h-1 w-full bg-green-500" />
          <div className="p-5 flex flex-col sm:flex-row sm:items-center gap-5">
            {/* Status + time */}
            <div className="flex items-center gap-3 flex-1">
              <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
                <Unlock size={18} className="text-green-600" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-green-700">
                    {t("sessionOpen")}
                  </span>
                  <span className="text-xs text-gray-400 bg-green-50 border border-green-100 px-1.5 py-0.5 rounded-full font-mono">
                    {formatDuration(session.opened_at)}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  {t("since")}{" "}
                  {new Date(session.opened_at).toLocaleTimeString(locale, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {" · "}
                  {session.transaction_count} movs.
                </p>
              </div>
            </div>

            {/* Expected cash — hero number */}
            <div className="text-center sm:text-right">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                {t("expectedCash")}
              </p>
              <p className="text-4xl font-black tabular-nums text-gray-900">
                {formatCurrency(expectedCash)}
              </p>
            </div>

            {/* Close button */}
            <button
              onClick={() => {
                setCloseModal(true);
                setCloseError("");
              }}
              className="flex items-center gap-2 px-4 py-2.5 border-2 border-gray-200 text-gray-600 font-semibold text-sm rounded-xl hover:border-red-300 hover:text-red-600 transition-colors shrink-0"
            >
              <Lock size={14} />
              {t("closeSession")}
            </button>
          </div>
        </div>
      ) : session?.status === "closed" ? (
        <div className="bg-gray-50 rounded-2xl border border-gray-200 p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gray-200 flex items-center justify-center">
              <Lock size={18} className="text-gray-500" />
            </div>
            <div>
              <p className="font-semibold text-gray-600">
                {t("sessionClosed")}
              </p>
              <p className="text-xs text-gray-400">
                {new Date(session.closed_at!).toLocaleString(locale)}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setOpenModal(true);
              setOpenError("");
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white font-semibold text-sm rounded-xl hover:bg-gray-800 transition-colors"
          >
            <Unlock size={14} />
            {t("openSession")}
          </button>
        </div>
      ) : (
        /* No session */
        <div className="bg-white rounded-2xl border-2 border-dashed border-gray-200 p-10 flex flex-col items-center gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center">
            <Wallet size={28} className="text-gray-400" />
          </div>
          <div>
            <p className="font-bold text-gray-700 text-lg">{t("noSession")}</p>
            <p className="text-sm text-gray-400 mt-1 max-w-xs">
              {t("noSessionDesc")}
            </p>
          </div>
          <button
            onClick={() => {
              setOpenModal(true);
              setOpenError("");
            }}
            className="flex items-center gap-2 px-5 py-3 bg-gray-900 text-white font-semibold text-sm rounded-xl hover:bg-gray-800 transition-colors"
          >
            <Unlock size={15} />
            {t("openSession")}
          </button>
        </div>
      )}

      {/* ── Balance cards ── */}
      {session && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {/* Opening */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest mb-1">
              {t("openingBalance")}
            </p>
            <p className="text-lg font-black tabular-nums text-gray-700">
              {formatCurrency(openingAmount)}
            </p>
          </div>
          {/* Cash In */}
          <div className="bg-green-50 rounded-2xl border border-green-100 shadow-sm p-4">
            <p className="text-[9px] font-semibold text-green-500 uppercase tracking-widest mb-1">
              {t("cashIn")}
            </p>
            <p className="text-lg font-black tabular-nums text-green-700">
              +{formatCurrency(cashIn)}
            </p>
          </div>
          {/* Cash Out */}
          <div className="bg-red-50 rounded-2xl border border-red-100 shadow-sm p-4">
            <p className="text-[9px] font-semibold text-red-400 uppercase tracking-widest mb-1">
              {t("cashOut")}
            </p>
            <p className="text-lg font-black tabular-nums text-red-600">
              -{formatCurrency(cashOut)}
            </p>
          </div>
          {/* Card */}
          <div className="bg-blue-50 rounded-2xl border border-blue-100 shadow-sm p-4">
            <p className="text-[9px] font-semibold text-blue-400 uppercase tracking-widest mb-1">
              {t("cardIn")}
            </p>
            <p className="text-lg font-black tabular-nums text-blue-700">
              {formatCurrency(cardIn)}
            </p>
          </div>
          {/* Transfer */}
          <div className="bg-violet-50 rounded-2xl border border-violet-100 shadow-sm p-4">
            <p className="text-[9px] font-semibold text-violet-400 uppercase tracking-widest mb-1">
              {t("transferIn")}
            </p>
            <p className="text-lg font-black tabular-nums text-violet-700">
              {formatCurrency(transferIn)}
            </p>
          </div>
          {/* Credit (pending) */}
          <div className="bg-amber-50 rounded-2xl border border-amber-100 shadow-sm p-4">
            <p className="text-[9px] font-semibold text-amber-500 uppercase tracking-widest mb-1">
              {t("creditSales")}
            </p>
            <p className="text-lg font-black tabular-nums text-amber-700">
              {formatCurrency(creditSales)}
            </p>
          </div>
          {/* Owner Withdrawal */}
          <div className="bg-purple-50 rounded-2xl border border-purple-100 shadow-sm p-4">
            <p className="text-[9px] font-semibold text-purple-500 uppercase tracking-widest mb-1">
              {t("ownerWithdrawals")}
            </p>
            <p className="text-lg font-black tabular-nums text-purple-700">
              {formatCurrency(ownerWithdrawals)}
            </p>
          </div>
        </div>
      )}

      {/* ── Transactions ── */}
      {session && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <BarChart3 size={15} className="text-gray-400" />
              <h2 className="font-semibold text-sm text-gray-700">
                {t("transactions")}
              </h2>
              <span className="text-xs text-gray-400 font-mono">
                {filteredTx.length}
              </span>
            </div>
            <div className="flex gap-1">
              {(["all", "in", "out"] as TxFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setTxFilter(f)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                    txFilter === f
                      ? "bg-gray-900 text-white"
                      : "text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  {t(f)}
                </button>
              ))}
            </div>
          </div>

          {filteredTx.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-12">
              {t("noTransactions")}
            </p>
          ) : (
            <div className="divide-y divide-gray-50">
              {txGroups.map(({ key, items }) => (
                <div key={key}>
                  {/* Date separator — only shown when session spans multiple days */}
                  {txGroups.length > 1 && (
                    <div className="px-5 py-1.5 bg-gray-50 flex items-center gap-1.5">
                      <Calendar size={11} className="text-gray-400" />
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        {dateLabel(key)}
                      </span>
                    </div>
                  )}
                  {items.map((tx) => {
                    const Icon = TX_ICONS[tx.type] ?? Wallet;
                    const MethodIcon =
                      METHOD_ICONS[tx.payment_method] ?? Banknote;
                    const isIn = tx.direction === "in";
                    const amount = parseFloat(tx.amount);
                    const isOpening = tx.type === "opening";
                    const isOwner = tx.type === "owner_withdrawal";

                    return (
                      <div
                        key={tx.id}
                        className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors"
                      >
                        {/* Icon */}
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                            isOpening
                              ? "bg-gray-100"
                              : isOwner
                                ? "bg-purple-100"
                                : isIn
                                  ? "bg-green-100"
                                  : "bg-red-100"
                          }`}
                        >
                          <Icon
                            size={16}
                            className={
                              isOpening
                                ? "text-gray-500"
                                : isOwner
                                  ? "text-purple-600"
                                  : isIn
                                    ? "text-green-600"
                                    : "text-red-500"
                            }
                          />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-700 truncate">
                            {tx.description === "Opening balance"
                              ? t("txType.opening")
                              : tx.description?.match(/^(Credit sale|Sale) \((\d+) items\)$/)
                                ? (() => {
                                    const match = tx.description.match(
                                      /^(Credit sale|Sale) \((\d+) items\)$/,
                                    );
                                    const type =
                                      match![1] === "Credit sale"
                                        ? "credit_sale"
                                        : "sale";
                                    const count = parseInt(match![2]);
                                    const unit = t(
                                      count === 1
                                        ? "itemsUnitSingular"
                                        : "itemsUnitPlural",
                                    );
                                    return `${t(`txType.${type}`)} (${count} ${unit})`;
                                  })()
                                : tx.description ?? t(`txType.${tx.type}`)}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                                isOpening
                                  ? "bg-gray-100 text-gray-500"
                                  : isOwner
                                    ? "bg-purple-100 text-purple-700"
                                    : isIn
                                      ? "bg-green-100 text-green-700"
                                      : "bg-red-100 text-red-600"
                              }`}
                            >
                              {t(`txType.${tx.type}`)}
                            </span>
                            <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
                              <MethodIcon size={9} />
                              {t(`method.${tx.payment_method}` as any)}
                            </span>
                          </div>
                        </div>

                        {/* Time */}
                        <p className="text-xs text-gray-400 font-mono shrink-0 hidden sm:block">
                          {new Date(tx.created_at).toLocaleTimeString(locale, {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>

                        {/* Amount */}
                        <p
                          className={`text-sm font-bold tabular-nums font-mono w-24 text-right shrink-0 ${
                            isOpening
                              ? "text-gray-600"
                              : isOwner
                                ? "text-purple-600"
                                : isIn
                                  ? "text-green-600"
                                  : "text-red-500"
                          }`}
                        >
                          {isOpening ? "" : isOwner ? "" : isIn ? "+" : "-"}
                          {formatCurrency(amount)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Session History ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 pt-4 pb-3 border-b border-gray-100 space-y-3">
          <div className="flex items-center gap-2">
            <Clock size={15} className="text-gray-400" />
            <h2 className="font-semibold text-sm text-gray-700">
              {t("sessionHistory")}
            </h2>
          </div>
          {/* Quick filter pills + date picker */}
          <div className="flex flex-wrap items-center gap-2">
            {(["all", "today", "yesterday", "week"] as const).map((f) => (
              <button
                key={f}
                onClick={() => {
                  setHistoryFilter(f);
                  setCustomDate("");
                }}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-full transition-colors ${
                  historyFilter === f
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                {t(`historyFilter.${f}`)}
              </button>
            ))}
            {/* Date picker */}
            <div className="flex items-center gap-1.5 ml-auto">
              <Calendar size={12} className="text-gray-400 shrink-0" />
              <input
                type="date"
                value={customDate}
                onChange={(e) => {
                  setCustomDate(e.target.value);
                  setHistoryFilter(e.target.value ? "custom" : "all");
                }}
                className={`text-[11px] font-semibold rounded-full px-2.5 py-1 border transition-colors outline-none focus:ring-2 focus:ring-gray-300 ${
                  historyFilter === "custom"
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-gray-100 text-gray-500 border-transparent hover:bg-gray-200"
                }`}
              />
            </div>
          </div>
        </div>
        {filteredHistory.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-8">
            {t("noHistory")}
          </p>
        ) : (
          <div className="divide-y divide-gray-50">
            {filteredHistory.map((s) => {
              const diff = s.difference ? parseFloat(s.difference) : null;
              const expected = parseFloat(s.expected_cash_balance);
              const isOpen = s.status === "open";
              return (
                <Link
                  key={s.id}
                  href={`/${locale}/cashbox/session/${s.id}`}
                  className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${isOpen ? "bg-green-100" : "bg-gray-100"}`}
                  >
                    {isOpen ? (
                      <Unlock size={14} className="text-green-600" />
                    ) : (
                      <Lock size={14} className="text-gray-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p suppressHydrationWarning className="text-sm font-semibold text-gray-700">
                      {new Date(s.opened_at).toLocaleDateString(locale, {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    <p suppressHydrationWarning className="text-xs text-gray-400">
                      {s.transaction_count} movs.
                      {s.closed_at &&
                        ` · ${new Date(s.closed_at).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <p className="text-sm font-bold tabular-nums text-gray-800 font-mono">
                        {formatCurrency(expected)}
                      </p>
                      {diff !== null && (
                        <p
                          className={`text-[10px] font-bold ${diff === 0 ? "text-green-600" : diff < 0 ? "text-red-500" : "text-blue-600"}`}
                        >
                          {diff === 0
                            ? "✓ " + t("balanced")
                            : diff < 0
                              ? `↓ ${t("short")} ${formatCurrency(Math.abs(diff))}`
                              : `↑ ${t("over")} ${formatCurrency(diff)}`}
                        </p>
                      )}
                    </div>
                    <ChevronRight
                      size={14}
                      className="text-gray-300 shrink-0"
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* ══ MODALS ══ */}

      {/* Open session modal */}
      {openModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpenModal(false);
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Unlock size={16} className="text-green-600" />
                <h3 className="font-semibold text-gray-800">
                  {t("openForm.title")}
                </h3>
              </div>
              <button
                onClick={() => setOpenModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={16} />
              </button>
            </div>
            <div className="px-5 py-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-600">
                  {t("openForm.opening")}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoFocus
                  value={formatNumber(openAmount)}
                  onChange={(e) => {
                    setOpenAmount(e.target.value.replace(/\D/g, ""));
                  }}
                  placeholder={t("openForm.openingPlaceholder")}
                  className="w-full h-14 text-3xl font-black text-right rounded-xl border border-gray-200 bg-gray-50 px-4 font-mono focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
                {/* Carry-over button */}
                {lastClosed?.closing_amount_counted && (
                  <button
                    type="button"
                    onClick={() => {
                      const amt = Math.round(
                        parseFloat(lastClosed.closing_amount_counted!),
                      );
                      setOpenAmount(String(amt));
                    }}
                    className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 rounded-lg px-3 py-2 w-full transition-colors"
                  >
                    <span className="font-black">↩</span>
                    <span>
                      {t("openForm.useLast")}{" "}
                      {formatCurrency(
                        Math.round(
                          parseFloat(lastClosed.closing_amount_counted),
                        ),
                      )}
                    </span>
                  </button>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-600">
                  {t("openForm.notes")}
                </label>
                <Input
                  value={openNotes}
                  onChange={(e) => setOpenNotes(e.target.value)}
                  className="h-9 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleOpenSession();
                  }}
                />
              </div>
              {openError && (
                <p className="text-red-500 text-xs bg-red-50 rounded-lg px-3 py-2">
                  {openError}
                </p>
              )}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 bg-white rounded-b-2xl">
              <Button
                onClick={handleOpenSession}
                disabled={openSubmitting}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold h-11"
              >
                {openSubmitting
                  ? t("openForm.submitting")
                  : t("openForm.submit")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Close session modal */}
      {closeModal && session && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setCloseModal(false);
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Lock size={16} className="text-red-500" />
                <h3 className="font-semibold text-gray-800">
                  {t("closeForm.title")}
                </h3>
              </div>
              <button
                onClick={() => setCloseModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={16} />
              </button>
            </div>
            <div className="px-5 py-5 space-y-4">
              {/* Expected */}
              <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                <p className="text-xs text-gray-500">
                  {t("closeForm.expected")}
                </p>
                <p className="text-2xl font-black tabular-nums text-gray-800">
                  {formatCurrency(expectedCash)}
                </p>
              </div>

              {/* Counted input */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-600">
                  {t("closeForm.counted")}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoFocus
                  value={formatNumber(countedAmount)}
                  onChange={(e) => {
                    setCountedAmount(e.target.value.replace(/\D/g, ""));
                  }}
                  placeholder={t("closeForm.countedPlaceholder")}
                  className={`w-full h-14 text-3xl font-black text-right rounded-xl border px-4 font-mono focus:outline-none focus:ring-2 transition-colors ${
                    !countedAmount
                      ? "border-gray-200 bg-gray-50 text-gray-900 focus:ring-gray-300"
                      : difference === 0
                        ? "border-green-400 bg-green-50 text-green-700 focus:ring-green-200"
                        : difference < 0
                          ? "border-red-400 bg-red-50 text-red-600 focus:ring-red-200"
                          : "border-blue-400 bg-blue-50 text-blue-700 focus:ring-blue-200"
                  }`}
                />
              </div>

              {/* Difference indicator */}
              {countedAmount && (
                <div
                  className={`flex items-center justify-between rounded-xl px-4 py-3 ${
                    difference === 0
                      ? "bg-green-50"
                      : difference < 0
                        ? "bg-red-50"
                        : "bg-blue-50"
                  }`}
                >
                  <span
                    className={`text-xs font-semibold ${
                      difference === 0
                        ? "text-green-700"
                        : difference < 0
                          ? "text-red-600"
                          : "text-blue-700"
                    }`}
                  >
                    {t("difference")}
                  </span>
                  <span
                    className={`text-xl font-black tabular-nums font-mono ${
                      difference === 0
                        ? "text-green-700"
                        : difference < 0
                          ? "text-red-600"
                          : "text-blue-700"
                    }`}
                  >
                    {difference === 0
                      ? "✓ " + t("closeForm.differenceOk")
                      : difference < 0
                        ? `▼ ${formatCurrency(Math.abs(difference))} ${t("closeForm.differenceShort")}`
                        : `▲ ${formatCurrency(difference)} ${t("closeForm.differenceOver")}`}
                  </span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-600">
                  {t("closeForm.notes")}
                </label>
                <Input
                  value={closeNotes}
                  onChange={(e) => setCloseNotes(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>

              <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                {t("closeForm.warn")}
              </p>

              {closeError && (
                <p className="text-red-500 text-xs bg-red-50 rounded-lg px-3 py-2">
                  {closeError}
                </p>
              )}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 bg-white rounded-b-2xl">
              <Button
                onClick={handleCloseSession}
                disabled={closeSubmitting || !countedAmount}
                className="w-full bg-red-500 hover:bg-red-600 text-white font-semibold h-11"
              >
                {closeSubmitting
                  ? t("closeForm.submitting")
                  : t("closeForm.submit")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Manual income / expense modal */}
      {txModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setTxModal(null);
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                {txModal === "income" ? (
                  <TrendingUp size={16} className="text-green-600" />
                ) : (
                  <TrendingDown size={16} className="text-red-500" />
                )}
                <h3 className="font-semibold text-gray-800">
                  {txModal === "income"
                    ? t("txForm.incomeTitle")
                    : t("txForm.expenseTitle")}
                </h3>
              </div>
              <button
                onClick={() => setTxModal(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={16} />
              </button>
            </div>
            <div className="px-5 py-5 space-y-4">
              {/* Amount */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-600">
                  {t("txForm.amount")}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoFocus
                  value={formatNumber(txAmount)}
                  onChange={(e) => {
                    setTxAmount(e.target.value.replace(/\D/g, ""));
                  }}
                  placeholder="0"
                  className={`w-full h-14 text-3xl font-black text-right rounded-xl border px-4 font-mono focus:outline-none focus:ring-2 ${
                    txModal === "income"
                      ? "border-green-300 bg-green-50 text-green-800 focus:ring-green-200"
                      : "border-red-300 bg-red-50 text-red-700 focus:ring-red-200"
                  }`}
                />
              </div>

              {/* Method */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-600">
                  {t("txForm.method")}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { val: "cash", Icon: Banknote },
                    { val: "card", Icon: CreditCard },
                    { val: "transfer", Icon: ArrowRightLeft },
                  ].map(({ val, Icon }) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setTxMethod(val)}
                      className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border-2 text-xs font-semibold transition-all ${
                        txMethod === val
                          ? txModal === "income"
                            ? "border-green-500 bg-green-50 text-green-700"
                            : "border-red-400 bg-red-50 text-red-700"
                          : "border-gray-200 text-gray-500 hover:border-gray-300"
                      }`}
                    >
                      <Icon size={16} />
                      {t(`method.${val}`)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-600">
                  {t("txForm.description")}
                </label>
                <Input
                  value={txDesc}
                  onChange={(e) => setTxDesc(e.target.value)}
                  placeholder={t("txForm.descriptionPlaceholder")}
                  className="h-9 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleManualTx();
                  }}
                />
              </div>

              {txError && (
                <p className="text-red-500 text-xs bg-red-50 rounded-lg px-3 py-2">
                  {txError}
                </p>
              )}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 bg-white rounded-b-2xl">
              <Button
                onClick={handleManualTx}
                disabled={txSubmitting || !txAmount}
                className={`w-full font-semibold h-11 text-white ${
                  txModal === "income"
                    ? "bg-green-600 hover:bg-green-700"
                    : "bg-red-500 hover:bg-red-600"
                }`}
              >
                {txSubmitting ? t("txForm.submitting") : t("txForm.submit")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
