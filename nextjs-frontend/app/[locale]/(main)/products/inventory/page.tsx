import { getLocale } from "next-intl/server";

import { fetchInventoryCounts } from "@/components/actions/inventory-action";
import { InventoryCount } from "@/components/inventory/inventory-count";
import { requireOwnerPage } from "@/lib/session";

export default async function InventoryPage() {
  await requireOwnerPage();
  const [history, locale] = await Promise.all([fetchInventoryCounts(), getLocale()]);
  return <InventoryCount history={history.data ?? []} locale={locale} />;
}
