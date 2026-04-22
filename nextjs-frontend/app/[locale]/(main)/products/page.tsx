import { fetchItems } from "@/components/actions/items-action";
import { ReadItemResponse } from "@/app/openapi-client";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { PageSizeSelector } from "@/components/page-size-selector";
import { PagePagination } from "@/components/page-pagination";
import { getTranslations } from "next-intl/server";
import { ProductsTable } from "./ProductsTable";

interface ProductsPageProps {
  searchParams: Promise<{
    page?: string;
    size?: string;
  }>;
}

export default async function ProductsPage({
  searchParams,
}: ProductsPageProps) {
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const size = Number(params.size) || 10;
  const t = await getTranslations("products");

  const items = (await fetchItems(page, size)) as ReadItemResponse;
  const totalPages = Math.ceil((items.total || 0) / size);

  return (
    <div>
      <h2 className="text-2xl font-semibold mb-6">{t("title")}</h2>
      <p className="text-lg mb-6">{t("subtitle")}</p>

      <div className="mb-6">
        <Link href="/products/add-item">
          <Button variant="outline" className="text-lg px-4 py-2">
            {t("addNewProduct")}
          </Button>
        </Link>
      </div>

      <section className="p-6 bg-white rounded-lg shadow-lg mt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">{t("title")}</h2>
          <PageSizeSelector currentSize={size} />
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

