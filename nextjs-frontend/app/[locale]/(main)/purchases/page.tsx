import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableHeader,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  fetchPurchases,
  PurchasesPage,
} from "@/components/actions/purchases-action";
import { formatCurrency } from "@/lib/currency";
import { PageSizeSelector } from "@/components/page-size-selector";
import { PagePagination } from "@/components/page-pagination";
import { Truck } from "lucide-react";
import { TableFilters } from "@/components/ui/table-filters";

interface Props {
  searchParams: Promise<{
    page?: string;
    size?: string;
    q?: string;
    payment_status?: string;
    status?: string;
  }>;
}

const PAYMENT_STATUS_STYLE: Record<string, string> = {
  paid: "bg-green-100 text-green-700",
  unpaid: "bg-red-100 text-red-700",
  partial: "bg-amber-100 text-amber-700",
};

const STATUS_STYLE: Record<string, string> = {
  received: "bg-green-100 text-green-700",
  partial: "bg-amber-100 text-amber-700",
  cancelled: "bg-gray-100 text-gray-500",
};

export default async function PurchasesListPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const size = Number(params.size) || 10;
  const q = params.q ?? undefined;
  const paymentStatus = params.payment_status ?? undefined;
  const status = params.status ?? undefined;
  const t = await getTranslations("purchases");

  const result = await fetchPurchases(page, size, q, paymentStatus, status);
  const data = "message" in result ? null : (result as PurchasesPage);
  const totalPages = data ? Math.ceil((data.total || 0) / size) : 0;

  // Aggregate stats for header cards
  const totalSpent =
    data?.items.reduce((s, p) => s + parseFloat(p.total_cost), 0) ?? 0;
  const unpaidCount =
    data?.items.filter((p) => p.payment_status === "unpaid").length ?? 0;

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold">{t("title")}</h2>
          <p className="text-gray-500 mt-1">{t("subtitle")}</p>
        </div>
        <Link href="/purchases/new">
          <Button className="bg-green-600 hover:bg-green-700 text-white font-semibold px-5 gap-2">
            <Truck size={15} /> {t("newPurchase")}
          </Button>
        </Link>
      </div>

      {/* Summary cards */}
      {data && data.items.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1">
              {t("table.total")} ({t("table.items")})
            </p>
            <p className="text-2xl font-black text-gray-900 tabular-nums">
              {data.total}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1">
              {t("detail.total")} ({t("table.paymentStatus")})
            </p>
            <p className="text-2xl font-black text-gray-900 tabular-nums">
              {formatCurrency(totalSpent.toString())}
            </p>
          </div>
          <div
            className={`rounded-2xl border shadow-sm p-5 ${unpaidCount > 0 ? "bg-red-50 border-red-100" : "bg-white border-gray-100"}`}
          >
            <p
              className={`text-[11px] font-semibold uppercase tracking-widest mb-1 ${unpaidCount > 0 ? "text-red-400" : "text-gray-400"}`}
            >
              {t("paymentStatus.unpaid")}
            </p>
            <p
              className={`text-2xl font-black tabular-nums ${unpaidCount > 0 ? "text-red-700" : "text-gray-900"}`}
            >
              {unpaidCount}
            </p>
          </div>
        </div>
      )}

      {/* Table */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 gap-4 flex-wrap">
          <h3 className="font-semibold text-gray-800">{t("title")}</h3>
          <div className="flex items-center gap-2 flex-wrap">
            <TableFilters
              fields={[
                {
                  type: "search",
                  key: "q",
                  placeholder: t("searchPlaceholder"),
                },
                {
                  type: "select",
                  key: "payment_status",
                  placeholder: t("filter.allPaymentStatus"),
                  options: [
                    { value: "paid", label: t("paymentStatus.paid") },
                    { value: "unpaid", label: t("paymentStatus.unpaid") },
                    { value: "partial", label: t("paymentStatus.partial") },
                  ],
                },
                {
                  type: "select",
                  key: "status",
                  placeholder: t("filter.allStatus"),
                  options: [
                    { value: "received", label: t("status.received") },
                    { value: "partial", label: t("status.partial") },
                    { value: "cancelled", label: t("status.cancelled") },
                  ],
                },
              ]}
              clearLabel={t("filter.clear")}
            />
            <PageSizeSelector currentSize={size} />
          </div>
        </div>

        <Table className="min-w-full text-sm">
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead>{t("table.date")}</TableHead>
              <TableHead>{t("table.supplier")}</TableHead>
              <TableHead>{t("table.reference")}</TableHead>
              <TableHead className="text-center">{t("table.items")}</TableHead>
              <TableHead className="text-right">{t("table.total")}</TableHead>
              <TableHead className="text-center">
                {t("table.payment")}
              </TableHead>
              <TableHead className="text-center">
                {t("table.paymentStatus")}
              </TableHead>
              <TableHead className="text-center">{t("table.status")}</TableHead>
              <TableHead className="text-center">
                {t("table.actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!data?.items?.length ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-center py-16 text-gray-400"
                >
                  <div className="flex flex-col items-center gap-3">
                    <Truck size={36} className="text-gray-200" />
                    <p>{t("noResults")}</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              data.items.map((purchase) => (
                <TableRow key={purchase.id} className="hover:bg-gray-50">
                  <TableCell className="text-gray-600 text-xs">
                    {new Date(purchase.purchase_date).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="font-medium text-gray-800">
                    {purchase?.supplier?.name ?? (
                      <span className="text-gray-400 italic text-xs">
                        {t("detail.noSupplier")}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-gray-500">
                    {purchase.reference_number ?? "—"}
                  </TableCell>
                  <TableCell className="text-center font-mono text-gray-700">
                    {purchase.purchase_items.length}
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold text-gray-900">
                    {formatCurrency(purchase.total_cost)}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                      {t(`paymentMethod.${purchase.payment_method}`)}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${PAYMENT_STATUS_STYLE[purchase.payment_status] ?? "bg-gray-100 text-gray-700"}`}
                    >
                      {t(`paymentStatus.${purchase.payment_status}`)}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_STYLE[purchase.status] ?? "bg-gray-100 text-gray-700"}`}
                    >
                      {t(`status.${purchase.status}`)}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <Link
                      href={`/purchases/${purchase.id}`}
                      className="text-blue-600 hover:underline text-xs font-medium"
                    >
                      {t("table.view")}
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {data && (
          <div className="px-6 py-4 border-t border-gray-100">
            <PagePagination
              currentPage={page}
              totalPages={totalPages}
              pageSize={size}
              totalItems={data.total || 0}
              basePath="/purchases"
            />
          </div>
        )}
      </section>
    </div>
  );
}
