import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableHeader,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { fetchItems } from "@/components/actions/items-action";
import { DeleteButton } from "./deleteButton";
import { ReadItemResponse } from "@/app/openapi-client";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { PageSizeSelector } from "@/components/page-size-selector";
import { PagePagination } from "@/components/page-pagination";
import { getTranslations } from "next-intl/server";

interface DashboardPageProps {
  searchParams: Promise<{
    page?: string;
    size?: string;
  }>;
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const size = Number(params.size) || 10;
  const t = await getTranslations("dashboard");

  const items = (await fetchItems(page, size)) as ReadItemResponse;
  const totalPages = Math.ceil((items.total || 0) / size);

  return (
    <div>
      <h2 className="text-2xl font-semibold mb-6">{t("title")}</h2>
      <p className="text-lg mb-6">{t("subtitle")}</p>

      <div className="mb-6">
        <Link href="/dashboard/add-item">
          <Button variant="outline" className="text-lg px-4 py-2">
            {t("addNewProduct")}
          </Button>
        </Link>
      </div>

      <section className="p-6 bg-white rounded-lg shadow-lg mt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">{t("products")}</h2>
          <PageSizeSelector currentSize={size} />
        </div>

        <Table className="min-w-full text-sm">
          <TableHeader>
            <TableRow>
              <TableHead>{t("table.name")}</TableHead>
              <TableHead>{t("table.sku")}</TableHead>
              <TableHead>{t("table.category")}</TableHead>
              <TableHead className="text-center">{t("table.soldBy")}</TableHead>
              <TableHead className="text-right">{t("table.stock")}</TableHead>
              <TableHead className="text-right">{t("table.price")}</TableHead>
              <TableHead className="text-center">{t("table.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!items.items?.length ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center">
                  {t("noResults")}
                </TableCell>
              </TableRow>
            ) : (
              items.items.map((item, index) => {
                const lowStock =
                  item.min_stock != null &&
                  parseFloat(item.stock ?? "0") <= parseFloat(item.min_stock);
                return (
                  <TableRow key={index}>
                    <TableCell>{item.name}</TableCell>
                    <TableCell className="text-gray-500">{item.sku ?? "—"}</TableCell>
                    <TableCell>{item.category ?? "—"}</TableCell>
                    <TableCell className="text-center capitalize">{item.unit_type ?? "unit"}</TableCell>
                    <TableCell className={`text-right font-mono ${lowStock ? "text-red-500 font-semibold" : ""}`}>
                      {item.stock ?? "0"} {lowStock && <span title="Low stock">⚠</span>}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {item.price != null ? `$${parseFloat(item.price).toFixed(2)}` : "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      <DropdownMenu>
                        <DropdownMenuTrigger className="cursor-pointer p-1 text-gray-600 hover:text-gray-800">
                          <span className="text-lg font-semibold">...</span>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="p-2">
                          <DropdownMenuItem disabled={true}>
                            {t("table.edit")}
                          </DropdownMenuItem>
                          <DeleteButton itemId={item.id} />
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        {/* Pagination Controls */}
        <PagePagination
          currentPage={page}
          totalPages={totalPages}
          pageSize={size}
          totalItems={items.total || 0}
          basePath="/dashboard"
        />
      </section>
    </div>
  );
}
