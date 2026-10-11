import { getLocale } from "next-intl/server";

import { listBusinesses, listUsers } from "@/components/actions/admin-action";
import { UsersSearchClient } from "@/components/admin/users-search-client";

export default async function AdminUsersPage() {
  const [users, businesses, locale] = await Promise.all([listUsers(), listBusinesses(), getLocale()]);
  return <UsersSearchClient initialUsers={users.data ?? []} businesses={businesses.data ?? []} locale={locale} />;
}
