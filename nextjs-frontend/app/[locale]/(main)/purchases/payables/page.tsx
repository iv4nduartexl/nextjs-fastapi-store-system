import { getLocale } from "next-intl/server";

import { fetchPayables } from "@/components/actions/purchasing-action";
import { PayablesClient } from "@/components/purchases/payables-client";

export default async function PayablesPage() {
  const [result, locale] = await Promise.all([fetchPayables(), getLocale()]);
  return (
    <PayablesClient
      summary={result.data ?? { total_owed: "0", supplier_count: 0, suppliers: [] }}
      locale={locale}
    />
  );
}
