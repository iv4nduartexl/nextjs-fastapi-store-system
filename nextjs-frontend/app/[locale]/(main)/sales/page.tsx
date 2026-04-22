import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableHeader,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { formatCurrency } from "@/lib/currency";
import { fetchSales, SalesPage } from "@/components/actions/sales-action";
import { PageSizeSelector } from "@/components/page-size-selector";
import { PagePagination } from "@/components/page-pagination";
import { TableFilters } from "@/components/ui/table-filters";

interface SalesPageProps {
  searchParams: Promise<{ page?: string; size?: string; payment_method?: string; status?: string }>;
}

export default async function SalesHistoryPage({ searchParams }: SalesPageProps) {
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const size = Number(params.size) || 10;
  const paymentMethod = params.payment_method ?? undefined;
  const status = params.status ?? undefined;
  const t = await getTranslations("sales");

  const result = await fetchSales(page, size, paymentMethod, status);
  const sales = "message" in result ? null : (result as SalesPage);
  const totalPages = sales ? Math.ceil((sales.total || 0) / size) : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold">{t("title")}</h2>
          <p className="text-gray-500 mt-1">{t("subtitle")}</p>
        </div>
        <Link href="/sales/new">
          <Button className="bg-green-600 hover:bg-green-700 text-white font-semibold px-6">
            + {t("newSale")}
          </Button>
        </Link>
      </div>

      <section className="p-6 bg-white rounded-lg shadow-lg">
        <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
          <h3 className="text-lg font-semibold">{t("title")}</h3>
          <div className="flex items-center gap-2 flex-wrap">
            <TableFilters
              fields={[
                {
                  type: "select",
                  key: "payment_method",
                  placeholder: t("filter.allPaymentMethods"),
                  options: [
                    { value: "cash", label: t("paymentMethod.cash") },
                    { value: "card", label: t("paymentMethod.card") },
                    { value: "credit", label: t("paymentMethod.credit") },
                    { value: "other", label: t("paymentMethod.other") },
                  ],
                },
                {
                  type: "select",
                  key: "status",
                  placeholder: t("filter.allStatus"),
                  options: [
                    { value: "completed", label: t("status.completed") },
                    { value: "cancelled", label: t("status.cancelled") },
                    { value: "refunded", label: t("status.refunded") },
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
            <TableRow>
              <TableHead>{t("table.date")}</TableHead>
              <TableHead className="text-center">{t("table.items")}</TableHead>
              <TableHead className="text-right">{t("table.total")}</TableHead>
              <TableHead className="text-center">{t("table.payment")}</TableHead>
              <TableHead className="text-center">{t("table.status")}</TableHead>
              <TableHead className="text-center">{t("table.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!sales?.items?.length ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-gray-400">
                  {t("noResults")}
                </TableCell>
              </TableRow>
            ) : (
              sales.items.map((sale) => (
                <TableRow key={sale.id} className="hover:bg-gray-50">
                  <TableCell className="text-gray-600">
                    {new Date(sale.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-center font-mono">
                    {sale.sale_items.length}
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold">
                    {formatCurrency(sale.total)}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                      {t(`paymentMethod.${sale.payment_method}`)}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        sale.status === "completed"
                          ? "bg-green-100 text-green-700"
                          : sale.status === "refunded"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {t(`status.${sale.status}`)}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <Link
                      href={`/sales/${sale.id}`}
                      className="text-blue-600 hover:underline text-xs"
                    >
                      {t("table.view")}
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {sales && (
          <PagePagination
            currentPage={page}
            totalPages={totalPages}
            pageSize={size}
            totalItems={sales.total || 0}
            basePath="/sales"
          />
        )}
      </section>
    </div>
  );
}
