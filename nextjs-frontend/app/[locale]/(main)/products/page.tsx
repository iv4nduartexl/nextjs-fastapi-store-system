import { fetchItems } from "@/components/actions/items-action";
import { ReadItemResponse } from "@/app/openapi-client";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/routing";
import { PageSizeSelector } from "@/components/page-size-selector";
import { PagePagination } from "@/components/page-pagination";
import { getTranslations, getLocale } from "next-intl/server";
import { ProductsTable } from "./ProductsTable";
import { TableFilters } from "@/components/ui/table-filters";
import { getMe } from "@/lib/session";
import { ClipboardCheck } from "lucide-react";

interface ProductsPageProps {
  searchParams: Promise<{
    page?: string;
    size?: string;
    q?: string;
  }>;
}

export default async function ProductsPage({
  searchParams,
}: ProductsPageProps) {
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const size = Number(params.size) || 10;
  const q = params.q ?? undefined;
  const t = await getTranslations("products");
  const locale = await getLocale();

  const [items, me] = await Promise.all([
    fetchItems(page, size, q) as Promise<ReadItemResponse>,
    getMe(),
  ]);
  const totalPages = Math.ceil((items.total || 0) / size);

  return (
    <div>
      <h2 className="text-2xl font-semibold mb-6">{t("title")}</h2>
      <p className="text-lg mb-6">{t("subtitle")}</p>

      <div className="mb-6 flex flex-wrap gap-3">
        <Link href="/products/add-item">
          <Button variant="outline" className="text-lg px-4 py-2">
            {t("addNewProduct")}
          </Button>
        </Link>
        {me?.role === "owner" && (
          <Link href="/products/inventory">
            <Button className="text-lg px-4 py-2 gap-2 bg-green-600 hover:bg-green-700">
              <ClipboardCheck size={18} /> {t("takeInventory")}
            </Button>
          </Link>
        )}
      </div>

      <section className="p-6 bg-white rounded-lg shadow-lg mt-8">
        <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
          <h2 className="text-xl font-semibold">{t("title")}</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <TableFilters
              fields={[
                {
                  type: "search",
                  key: "q",
                  placeholder: t("searchPlaceholder"),
                },
              ]}
              clearLabel={t("clearFilters")}
            />
            <PageSizeSelector currentSize={size} />
          </div>
        </div>

        <ProductsTable items={items.items ?? []} />

        <PagePagination
          currentPage={page}
          totalPages={totalPages}
          pageSize={size}
          totalItems={items.total || 0}
          basePath="/products"
        />
      </section>
    </div>
  );
}
