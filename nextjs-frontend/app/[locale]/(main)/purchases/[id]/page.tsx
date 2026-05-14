import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  ArrowLeft,
  CalendarDays,
  Banknote,
  CreditCard,
  ArrowRightLeft,
  Landmark,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Clock,
  Truck,
  Hash,
} from "lucide-react";
import {
  fetchPurchase,
  PurchaseRead,
} from "@/components/actions/purchases-action";
import { formatCurrency } from "@/lib/currency";
import { formatNumber } from "@/lib/format-number";
import LocalSpan from "@/lib/LocalDateSpan";

interface Props {
  params: Promise<{ id: string; locale: string }>;
}

export default async function PurchaseDetailPage({ params }: Props) {
  const { id, locale } = await params;
  const t = await getTranslations("purchases");
  const tDash = await getTranslations("dashboard");

  const result = await fetchPurchase(id);
  if ("message" in result) notFound();
  const purchase = result as PurchaseRead;

  const purchaseDate = new Date(purchase.purchase_date);

  const shortId = purchase.id.split("-")[0].toUpperCase();

  const STATUS_CONFIG = {
    received: {
      label: t("status.received"),
      icon: CheckCircle2,
      cls: "bg-green-100 text-green-700 border-green-200",
      iconCls: "text-green-600",
    },
    partial: {
      label: t("status.partial"),
      icon: AlertCircle,
      cls: "bg-amber-100 text-amber-700 border-amber-200",
      iconCls: "text-amber-500",
    },
    cancelled: {
      label: t("status.cancelled"),
      icon: XCircle,
      cls: "bg-gray-100 text-gray-500 border-gray-200",
      iconCls: "text-gray-400",
    },
  } as const;

  const PAYMENT_STATUS_CONFIG = {
    paid: {
      label: t("paymentStatus.paid"),
      cls: "bg-green-100 text-green-700 border-green-200",
    },
    unpaid: {
      label: t("paymentStatus.unpaid"),
      cls: "bg-red-100 text-red-700 border-red-200",
    },
    partial: {
      label: t("paymentStatus.partial"),
      cls: "bg-amber-100 text-amber-700 border-amber-200",
    },
  } as const;

  const PAYMENT_ICONS = {
    cash: Banknote,
    card: CreditCard,
    transfer: ArrowRightLeft,
    credit: Landmark,
  } as const;

  const status = STATUS_CONFIG[purchase.status] ?? STATUS_CONFIG.received;
  const paymentStatus =
    PAYMENT_STATUS_CONFIG[purchase.payment_status] ??
    PAYMENT_STATUS_CONFIG.paid;
  const StatusIcon = status.icon;
  const PayIcon = PAYMENT_ICONS[purchase.payment_method] ?? Banknote;

  const hasTax = parseFloat(purchase.tax) > 0;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Back + header */}
      <div>
        <Link
          href="/purchases"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors mb-4"
        >
          <ArrowLeft size={15} />
          {t("detail.back")}
        </Link>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
              <Truck size={20} className="text-gray-500" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 leading-tight">
                {t("detail.purchaseId")}{" "}
                <span className="font-mono text-gray-500">#{shortId}</span>
              </h1>
              <div className="flex items-center gap-1.5 mt-0.5 text-sm text-gray-500">
                <CalendarDays size={13} />
                <span>
                  <LocalSpan
                    dateIso={purchase.purchase_date}
                    locale={locale}
                    options={{
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    }}
                  />{" "}
                  ·{" "}
                  <LocalSpan
                    dateIso={purchase.purchase_date}
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

          <div className="flex items-center gap-2 flex-wrap">
            {/* Delivery status */}
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border ${status.cls}`}
            >
              <StatusIcon size={14} className={status.iconCls} />
              {status.label}
            </span>
            {/* Payment status */}
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border ${paymentStatus.cls}`}
            >
              <Clock size={13} />
              {paymentStatus.label}
            </span>
          </div>
        </div>
      </div>

      {/* Supplier + payment info row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Total cost – full width top */}
        <div className="col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1">
            {t("detail.total")}
          </p>
          <p className="text-3xl font-black text-gray-900 tabular-nums">
            {formatCurrency(purchase.total_cost)}
          </p>
        </div>

        {/* Payment method */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-2">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">
            {t("detail.payment")}
          </p>
          <div className="flex items-center gap-2 mt-auto">
            <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
              <PayIcon size={16} className="text-gray-600" />
            </div>
            <span className="font-semibold text-gray-800 text-sm">
              {t(`paymentMethod.${purchase.payment_method}`)}
            </span>
          </div>
        </div>

        {/* Items count */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-2">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">
            {t("detail.items")}
          </p>
          <div className="flex items-end gap-1.5 mt-auto">
            <span className="text-2xl font-black text-gray-900 tabular-nums">
              {purchase.purchase_items.length}
            </span>
            <span className="text-sm text-gray-400 mb-0.5">
              {t(
                purchase.purchase_items.length === 1
                  ? "detail.itemsUnitSingular"
                  : "detail.itemsUnitPlural",
              )}
            </span>
          </div>
        </div>

        {/* Supplier */}
        <div className="col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1">
            {t("detail.supplier")}
          </p>
          <p className="font-semibold text-gray-800">
            {purchase?.supplier?.name ?? (
              <span className="italic text-gray-400 font-normal">
                {t("detail.noSupplier")}
              </span>
            )}
          </p>
          {purchase.reference_number && (
            <p className="text-xs text-gray-500 font-mono mt-0.5">
              {t("detail.reference")}: {purchase.reference_number}
            </p>
          )}
        </div>

        {/* Cost breakdown */}
        <div className="col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-2">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">
            {t("detail.summary")}
          </p>
          <div className="flex justify-between text-sm text-gray-600">
            <span>{t("detail.subtotal")}</span>
            <span className="font-mono tabular-nums">
              {formatCurrency(purchase.subtotal)}
            </span>
          </div>
          {hasTax && (
            <div className="flex justify-between text-sm text-gray-600">
              <span>{t("detail.tax")}</span>
              <span className="font-mono tabular-nums">
                {formatCurrency(purchase.tax)}
              </span>
            </div>
          )}
          <div className="flex justify-between text-sm font-bold text-gray-900 pt-2 border-t border-gray-100">
            <span>{t("detail.total")}</span>
            <span className="font-mono tabular-nums">
              {formatCurrency(purchase.total_cost)}
            </span>
          </div>
        </div>
      </div>

      {/* Items table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">{t("detail.items")}</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider w-14">
                {t("detail.unitType")}
              </th>
              <th className="text-left px-3 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                {t("detail.itemName")}
              </th>
              <th className="text-right px-3 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider w-24">
                {t("detail.qty")}
              </th>
              <th className="text-right px-3 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider w-32">
                {t("detail.costPrice")}
              </th>
              <th className="text-right px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider w-28">
                {t("detail.lineTotal")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {purchase.purchase_items.map((item) => {
              const abbr = tDash(`unitAbbr.${item.unit_type ?? "unit"}`);
              const qty = parseFloat(item.quantity);
              return (
                <tr
                  key={item.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-gray-100 text-[13px] font-black text-gray-500">
                      {abbr}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-medium text-gray-800">
                      {item.item_name}
                    </p>
                    {item.item_id ? (
                      <p className="text-[10px] text-green-600 font-medium mt-0.5">
                        ✓ {t("detail.linked")}
                      </p>
                    ) : (
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {t("form.unlinked")}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right font-mono font-semibold text-gray-800 tabular-nums">
                    {qty % 1 === 0 ? formatNumber(qty) : qty.toFixed(3)}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-gray-600 tabular-nums">
                    {formatCurrency(item.cost_price)}
                  </td>
                  <td className="px-5 py-3 text-right font-mono font-bold text-gray-900 tabular-nums">
                    {formatCurrency(item.subtotal)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-200 bg-gray-50">
              <td
                colSpan={4}
                className="px-5 py-4 text-sm font-semibold text-gray-500 text-right"
              >
                {t("detail.total")}
              </td>
              <td className="px-5 py-4 text-right font-mono font-black text-xl text-gray-900 tabular-nums">
                {formatCurrency(purchase.total_cost)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Notes */}
      {purchase.notes && (
        <div className="bg-amber-50 border border-amber-100 rounded-2xl px-5 py-4">
          <p className="text-[11px] font-semibold text-amber-500 uppercase tracking-widest mb-1">
            {t("detail.notes")}
          </p>
          <p className="text-sm text-gray-700">{purchase.notes}</p>
        </div>
      )}

      {/* Full UUID footer */}
      <div className="flex items-center gap-2 text-xs text-gray-400 pb-4">
        <Hash size={12} />
        <span className="font-mono">{purchase.id}</span>
      </div>
    </div>
  );
}
