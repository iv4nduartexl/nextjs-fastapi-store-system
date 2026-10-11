import { getLocale } from "next-intl/server";

import { listBusinesses } from "@/components/actions/admin-action";
import { BusinessesClient } from "@/components/admin/businesses-client";

export default async function AdminBusinessesPage() {
  const [result, locale] = await Promise.all([listBusinesses(), getLocale()]);
  return <BusinessesClient initialBusinesses={result.data ?? []} locale={locale} />;
}
