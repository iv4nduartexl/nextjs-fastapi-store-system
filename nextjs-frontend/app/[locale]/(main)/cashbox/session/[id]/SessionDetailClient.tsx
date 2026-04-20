"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowLeft,
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
  Lock,
  Unlock,
  Calendar,
  Clock,
  FileText,
  ExternalLink,
} from "lucide-react";
import {
  CashboxSessionRead,
  CashboxTransactionRead,
} from "@/components/actions/cashbox-action";
import { formatCurrency } from "@/lib/currency";

// ── Icons ──────────────────────────────────────────────────────────────────────

const TX_ICONS: Record<string, React.ElementType> = {
  sale: ShoppingCart,
  purchase: ShoppingBag,
  income: TrendingUp,
  expense: TrendingDown,
  customer_payment: Users,
  opening: Wallet,
};

const METHOD_ICONS: Record<string, React.ElementType> = {
  cash: Banknote,
  card: CreditCard,
  transfer: ArrowRightLeft,
  credit: Users,
  other: RefreshCcw,
};

// ── Helpers ────────────────────────────────────────────────────────────────────

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

function groupByDay(txs: CashboxTransactionRead[]) {
  const map = new Map<string, CashboxTransactionRead[]>();
  for (const tx of txs) {
    const key = new Date(tx.created_at).toDateString();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(tx);
  }
  return Array.from(map.entries()).map(([key, items]) => ({ key, items }));
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  colorClass = "bg-gray-50",
  labelColor = "text-gray-400",
  valueColor = "text-gray-800",
}: {
  label: string;
  value: string;
  colorClass?: string;
  labelColor?: string;
  valueColor?: string;
}) {
  return (
    <div className={`${colorClass} rounded-2xl px-4 py-3`}>
      <p className={`text-[9px] font-bold uppercase tracking-widest mb-1 ${labelColor}`}>{label}</p>
      <p className={`text-lg font-black tabular-nums font-mono ${valueColor}`}>{value}</p>
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

type TxFilter = "all" | "in" | "out";

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  session: CashboxSessionRead;
  transactions: CashboxTransactionRead[];
  locale: string;
}

export default function SessionDetailClient({ session, transactions, locale }: Props) {
  const t = useTranslations("cashbox");
  const currentLocale = useLocale();
  const [txFilter, setTxFilter] = useState<TxFilter>("all");

  const isOpen = session.status === "open";
  const opening = parseFloat(session.opening_amount) || 0;
  const expectedCash = parseFloat(session.expected_cash_balance) || 0;
  const cashIn = parseFloat(session.cash_in) || 0;
  const cashOut = parseFloat(session.cash_out) || 0;
  const cardIn = parseFloat(session.card_in) || 0;
  const transferIn = parseFloat(session.transfer_in) || 0;
  const creditSales = parseFloat(session.credit_sales) || 0;
  const counted = session.closing_amount_counted
    ? parseFloat(session.closing_amount_counted)
    : null;
  const diff = session.difference ? parseFloat(session.difference) : null;

  const filtered = transactions.filter((tx) => {
    if (txFilter === "in") return tx.direction === "in";
    if (txFilter === "out") return tx.direction === "out";
    return true;
  });

  const groups = groupByDay(filtered);

  function dayLabel(key: string) {
    const d = new Date(key);
    const today = new Date();
    if (isSameDay(d, today)) return t("today");
    const yest = new Date();
    yest.setDate(yest.getDate() - 1);
    if (isSameDay(d, yest)) return t("yesterday");
    return d.toLocaleDateString(locale, { weekday: "long", day: "2-digit", month: "long" });
  }

  const diffColor =
    diff === null ? "" : diff === 0 ? "text-green-700" : diff < 0 ? "text-red-600" : "text-blue-700";
  const diffBg =
    diff === null ? "bg-gray-50" : diff === 0 ? "bg-green-50" : diff < 0 ? "bg-red-50" : "bg-blue-50";

  return (
    <div className="space-y-5 pb-10">

      {/* ── Top nav bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <Link
          href={`/${currentLocale}/cashbox`}
          className="flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ArrowLeft size={16} />
          {t("title")}
        </Link>
        <span
          className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full ${
            isOpen
              ? "bg-green-100 text-green-700"
              : "bg-gray-100 text-gray-500"
          }`}
        >
          {isOpen ? <Unlock size={11} /> : <Lock size={11} />}
          {isOpen ? t("sessionCard.open") : t("sessionCard.closed")}
        </span>
      </div>

      {/* ── Session header ───────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className={`h-1 w-full ${isOpen ? "bg-green-500" : "bg-gray-300"}`} />
        <div className="px-6 py-5">
          <p className="text-xs font-bold uppercase text-gray-400 tracking-widest mb-1">
            {t("sessionDetail.title")}
          </p>
          <h1 className="text-2xl font-black text-gray-900">
            {new Date(session.opened_at).toLocaleDateString(locale, {
              weekday: "long",
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}
          </h1>

          {/* Timeline row */}
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-green-100 flex items-center justify-center">
                <Unlock size={13} className="text-green-600" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-gray-400 tracking-wide">
                  {t("sessionDetail.openedAt")}
                </p>
                <p className="text-sm font-bold text-gray-800">
                  {new Date(session.opened_at).toLocaleTimeString(locale, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {" · "}
                  <span className="font-normal text-gray-500">
                    {new Date(session.opened_at).toLocaleDateString(locale, {
                      day: "2-digit",
                      month: "short",
                    })}
                  </span>
                </p>
              </div>
            </div>

            {session.closed_at && (
              <>
                <div className="h-px w-8 bg-gray-200 hidden sm:block" />
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center">
                    <Lock size={13} className="text-gray-500" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase text-gray-400 tracking-wide">
                      {t("sessionDetail.closedAt")}
                    </p>
                    <p className="text-sm font-bold text-gray-800">
                      {new Date(session.closed_at).toLocaleTimeString(locale, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {" · "}
                      <span className="font-normal text-gray-500">
                        {new Date(session.closed_at).toLocaleDateString(locale, {
                          day: "2-digit",
                          month: "short",
                        })}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
                    <Clock size={13} className="text-blue-500" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase text-gray-400 tracking-wide">
                      {t("duration")}
                    </p>
                    <p className="text-sm font-bold text-blue-600">
                      {durationBetween(session.opened_at, session.closed_at)}
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>

          {session.notes && (
            <div className="mt-4 flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
              <FileText size={13} className="text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700 italic">"{session.notes}"</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Balance grid ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {/* Row 1: Opening | Expected Cash | Counted */}
        <StatCard label={t("openingBalance")} value={formatCurrency(opening)} />
        <StatCard label={t("expectedCash")} value={formatCurrency(expectedCash)} valueColor="text-gray-900" />
        <StatCard
          label={t("counted")}
          value={counted !== null ? formatCurrency(counted) : "—"}
          colorClass={counted !== null ? diffBg : "bg-gray-50"}
          valueColor={counted !== null ? diffColor : "text-gray-300"}
        />

        {/* Row 2: Cash In | Cash Out | Difference */}
        <StatCard
          label={t("cashIn")}
          value={"+" + formatCurrency(cashIn)}
          colorClass="bg-green-50"
          labelColor="text-green-500"
          valueColor="text-green-700"
        />
        <StatCard
          label={t("cashOut")}
          value={"-" + formatCurrency(cashOut)}
          colorClass="bg-red-50"
          labelColor="text-red-400"
          valueColor="text-red-600"
        />
        <StatCard
          label={t("difference")}
          value={
            diff === null
              ? "—"
              : diff === 0
              ? "✓ " + t("balanced")
              : (diff < 0 ? "▼ " : "▲ ") + formatCurrency(Math.abs(diff))
          }
          colorClass={diffBg}
          valueColor={diffColor || "text-gray-300"}
        />

        {/* Row 3: Card | Transfer | Credit */}
        <StatCard
          label={t("cardIn")}
          value={formatCurrency(cardIn)}
          colorClass="bg-blue-50"
          labelColor="text-blue-400"
          valueColor="text-blue-700"
        />
        <StatCard
          label={t("transferIn")}
          value={formatCurrency(transferIn)}
          colorClass="bg-violet-50"
          labelColor="text-violet-400"
          valueColor="text-violet-700"
        />
        <StatCard
          label={t("creditSales")}
          value={formatCurrency(creditSales)}
          colorClass="bg-amber-50"
          labelColor="text-amber-500"
          valueColor="text-amber-700"
        />
      </div>

      {/* ── Transaction feed ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Feed header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Calendar size={15} className="text-gray-400" />
            <h2 className="font-bold text-sm text-gray-700">
              {t("sessionDetail.transactions")}
            </h2>
            <span className="text-xs font-mono text-gray-400">
              {filtered.length}
            </span>
          </div>

          {/* Direction filter pills */}
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

        {filtered.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-12">
            {t("sessionDetail.noTransactions")}
          </p>
        ) : (
          <div className="divide-y divide-gray-50">
            {groups.map(({ key, items }) => (
              <div key={key}>
                {/* Date header — only when session spans multiple days */}
                {groups.length > 1 && (
                  <div className="px-5 py-2 bg-gray-50 flex items-center gap-2">
                    <Calendar size={11} className="text-gray-400" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                      {dayLabel(key)}
                    </span>
                  </div>
                )}

                {items.map((tx) => {
                  const Icon = TX_ICONS[tx.type] ?? Wallet;
                  const MethodIcon = METHOD_ICONS[tx.payment_method] ?? Banknote;
                  const isIn = tx.direction === "in";
                  const amount = parseFloat(tx.amount);
                  const isOpening = tx.type === "opening";

                  // Build drill-down href based on reference_type
                  const detailHref =
                    tx.reference_type === "sale" && tx.reference_id
                      ? `/${currentLocale}/sales/${tx.reference_id}`
                      : tx.reference_type === "purchase" && tx.reference_id
                      ? `/${currentLocale}/purchases/${tx.reference_id}`
                      : tx.reference_type === "customer_payment" && tx.reference_id
                      ? `/${currentLocale}/customers/${tx.reference_id}`
                      : null;

                  const isManual =
                    tx.type === "income" || tx.type === "expense";

                  const rowContent = (
                    <>
                      {/* Type icon */}
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          isOpening
                            ? "bg-gray-100"
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
                              : isIn
                              ? "text-green-600"
                              : "text-red-500"
                          }
                        />
                      </div>

                      {/* Description + badges */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-semibold text-gray-800 truncate">
                            {tx.description ?? t(`txType.${tx.type}`)}
                          </p>
                          {detailHref && (
                            <ExternalLink size={11} className="text-gray-400 shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                              isOpening
                                ? "bg-gray-100 text-gray-500"
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
                        {/* Prominent notes for manual income/expense */}
                        {isManual && tx.description && (
                          <div className="flex items-start gap-1 mt-1.5">
                            <FileText size={10} className="text-gray-400 mt-0.5 shrink-0" />
                            <p className="text-[11px] text-gray-500 italic leading-snug">
                              {tx.description}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Time + amount */}
                      <div className="text-right shrink-0">
                        <p
                          className={`text-sm font-black tabular-nums font-mono ${
                            isOpening
                              ? "text-gray-600"
                              : isIn
                              ? "text-green-600"
                              : "text-red-500"
                          }`}
                        >
                          {isOpening ? "" : isIn ? "+" : "-"}
                          {formatCurrency(amount)}
                        </p>
                        <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                          {new Date(tx.created_at).toLocaleTimeString(locale, {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </>
                  );

                  return detailHref ? (
                    <Link
                      key={tx.id}
                      href={detailHref}
                      className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors group"
                    >
                      {rowContent}
                    </Link>
                  ) : (
                    <div
                      key={tx.id}
                      className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50/50 transition-colors"
                    >
                      {rowContent}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {/* ── Footer totals ──────────────────────────────────────────────────── */}
        {filtered.length > 0 && (
          <div className="px-5 py-3.5 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500">
              {filtered.length} {t("sessionDetail.transactions").toLowerCase()}
            </span>
            <div className="flex items-center gap-4">
              <span className="text-xs font-bold text-green-600">
                +{formatCurrency(
                  filtered
                    .filter((tx) => tx.direction === "in" && tx.type !== "opening")
                    .reduce((s, tx) => s + parseFloat(tx.amount), 0)
                )}
              </span>
              <span className="text-xs font-bold text-red-500">
                -{formatCurrency(
                  filtered
                    .filter((tx) => tx.direction === "out")
                    .reduce((s, tx) => s + parseFloat(tx.amount), 0)
                )}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
