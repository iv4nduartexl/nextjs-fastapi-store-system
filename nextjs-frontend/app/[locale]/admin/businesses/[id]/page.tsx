import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";

import { getBusiness, listBusinesses, listUsers } from "@/components/actions/admin-action";
import { BusinessDetailClient } from "@/components/admin/business-detail-client";

export default async function AdminBusinessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [business, users, businesses, locale] = await Promise.all([
    getBusiness(id),
    listUsers({ business_id: id }),
    listBusinesses(),
    getLocale(),
  ]);
  if (!business.data) notFound();
  return (
    <BusinessDetailClient
      business={business.data}
      initialUsers={users.data ?? []}
      businesses={businesses.data ?? []}
      locale={locale}
    />
  );
}
