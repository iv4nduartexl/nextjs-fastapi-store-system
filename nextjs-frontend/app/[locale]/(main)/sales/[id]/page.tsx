import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  ArrowLeft,
  CalendarDays,
  Banknote,
  CreditCard,
  RefreshCcw,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Receipt,
  Hash,
  Users,
} from "lucide-react";
import { fetchSale, SaleRead } from "@/components/actions/sales-action";
import { formatCurrency } from "@/lib/currency";
import { formatNumber } from "@/lib/format-number";
import LocalDateSpan from "@/lib/LocalDateSpan";

interface Props {
  params: Promise<{ id: string; locale: string }>;
}

export default async function SaleDetailPage({ params }: Props) {
  const { id, locale } = await params;
  const t = await getTranslations("sales");
  const tDash = await getTranslations("dashboard");

  const result = await fetchSale(id);
  if ("message" in result) notFound();
  const sale = result as SaleRead;

  const shortId = sale.id.split("-")[0].toUpperCase();

  const statusConfig = {
    completed: {
      label: t("status.completed"),
      icon: CheckCircle2,
      cls: "bg-green-100 text-green-700 border-green-200",
      iconCls: "text-green-600",
    },
    cancelled: {
      label: t("status.cancelled"),
      icon: XCircle,
      cls: "bg-red-100 text-red-700 border-red-200",
      iconCls: "text-red-500",
    },
    refunded: {
      label: t("status.refunded"),
      icon: RotateCcw,
      cls: "bg-amber-100 text-amber-700 border-amber-200",
      iconCls: "text-amber-500",
    },
  } as const;

  const paymentIcons = {
    cash: Banknote,
    card: CreditCard,
    other: RefreshCcw,
    credit: Users,
  } as const;

  const status = statusConfig[sale.status] ?? statusConfig.completed;
  const PayIcon = paymentIcons[sale.payment_method] ?? Banknote;
  const StatusIcon = status.icon;

  const hasCashDetails =
    sale.payment_method === "cash" &&
    (sale.amount_tendered != null || sale.change_given != null);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Back + header */}
      <div>
        <Link
          href="/sales"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors mb-4"
        >
          <ArrowLeft size={15} />
          {t("detail.back")}
        </Link>

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
              <Receipt size={20} className="text-gray-500" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 leading-tight">
                {t("detail.saleId")}{" "}
                <span className="font-mono text-gray-500">#{shortId}</span>
              </h1>
              <div className="flex items-center gap-1.5 mt-0.5 text-sm text-gray-500">
                <CalendarDays size={13} />
                <span>
                  <LocalDateSpan
                    dateIso={sale.created_at}
                    locale={locale}
                    options={{
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    }}
                  />{" "}
                  ·{" "}
                  <LocalDateSpan
                    dateIso={sale.created_at}
                    locale={locale}
                    options={{
                      hour: "2-digit",
                      minute: "2-digit",
                    }}
                  />
                </span>
              </div>
            </div>
          </div>

          {/* Status badge */}
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border ${status.cls}`}
          >
            <StatusIcon size={14} className={status.iconCls} />
            {status.label}
          </span>
        </div>
      </div>

      {/* Summary cards */}
      <div
        className={`grid gap-4 ${hasCashDetails ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2"}`}
      >
        {/* Total */}
        <div className="col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">
            {t("detail.total")}
          </span>
          <span className="text-3xl font-black text-gray-900 tabular-nums">
            {formatCurrency(sale.total)}
          </span>
        </div>

        {/* Payment method */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-2">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">
            {t("detail.payment")}
          </span>
          <div className="flex items-center gap-2 mt-auto">
            <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
              <PayIcon size={16} className="text-gray-600" />
            </div>
            <span className="font-semibold text-gray-800 text-sm">
              {t(`paymentMethod.${sale.payment_method}`)}
            </span>
          </div>
        </div>

        {/* Items count */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-2">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">
            {t("detail.items")}
          </span>
          <div className="flex items-end gap-1.5 mt-auto">
            <span className="text-2xl font-black text-gray-900 tabular-nums">
              {sale.sale_items.length}
            </span>
            <span className="text-sm text-gray-400 mb-0.5">
              {t(
                sale.sale_items.length === 1
                  ? "detail.itemsUnitSingular"
                  : "detail.itemsUnitPlural",
              )}
            </span>
          </div>
        </div>

        {/* Cash details — only shown when cash payment */}
        {hasCashDetails && (
          <>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">
                {t("detail.tendered")}
              </span>
              <span className="text-xl font-bold text-gray-800 tabular-nums mt-auto">
                {sale.amount_tendered
                  ? formatCurrency(sale.amount_tendered)
                  : "—"}
              </span>
            </div>
            <div className="bg-green-50 rounded-2xl border border-green-100 shadow-sm p-5 flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-green-500 uppercase tracking-widest">
                {t("detail.change")}
              </span>
              <span className="text-xl font-bold text-green-700 tabular-nums mt-auto">
                {sale.change_given ? formatCurrency(sale.change_given) : "—"}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Items table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">{t("detail.items")}</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider w-16">
                {t("detail.unitType")}
              </th>
              <th className="text-left px-3 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                {t("detail.itemName")}
              </th>
              <th className="text-right px-3 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                {t("detail.unitPrice")}
              </th>
              <th className="text-right px-3 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider w-20">
                {t("detail.qty")}
              </th>
              <th className="text-right px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                {t("detail.subtotal")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sale.sale_items.map((item) => {
              const abbr = tDash(`unitAbbr.${item.unit_type ?? "unit"}`);
              const qty = parseFloat(item.quantity);
              return (
                <tr
                  key={item.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  {/* Unit abbr block */}
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-gray-100 text-[13px] font-black text-gray-500">
                      {abbr}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-medium text-gray-800">
                      {item.item_name}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-gray-600 tabular-nums">
                    {formatCurrency(item.unit_price)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span className="font-mono font-semibold text-gray-800 tabular-nums">
                      {qty % 1 === 0 ? formatNumber(qty) : qty.toFixed(3)}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right font-mono font-bold text-gray-900 tabular-nums">
                    {formatCurrency(item.subtotal)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {/* Footer total row */}
          <tfoot>
            <tr className="border-t-2 border-gray-200 bg-gray-50">
              <td
                colSpan={4}
                className="px-5 py-4 text-sm font-semibold text-gray-500 text-right"
              >
                {t("detail.total")}
              </td>
              <td className="px-5 py-4 text-right font-mono font-black text-xl text-gray-900 tabular-nums">
                {formatCurrency(sale.total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Notes */}
      {sale.notes && (
        <div className="bg-amber-50 border border-amber-100 rounded-2xl px-5 py-4">
          <p className="text-[11px] font-semibold text-amber-500 uppercase tracking-widest mb-1">
            {t("detail.notes")}
          </p>
          <p className="text-sm text-gray-700">{sale.notes}</p>
        </div>
      )}

      {/* Full ID footer */}
      <div className="flex items-center gap-2 text-xs text-gray-400 pb-4">
        <Hash size={12} />
        <span className="font-mono">{sale.id}</span>
      </div>
    </div>
  );
}
