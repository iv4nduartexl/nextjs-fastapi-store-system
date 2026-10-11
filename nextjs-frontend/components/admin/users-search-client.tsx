"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Search } from "lucide-react";

import { listUsers, type AdminBusiness, type AdminUser } from "@/components/actions/admin-action";
import { AdminUsersTable } from "@/components/admin/admin-users-table";
import { Input } from "@/components/ui/input";

export function UsersSearchClient({
  initialUsers,
  businesses,
  locale,
}: {
  initialUsers: AdminUser[];
  businesses: AdminBusiness[];
  locale: string;
}) {
  const t = useTranslations("admin");
  const [users, setUsers] = useState(initialUsers);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);

  // Server-side search, debounced
  useEffect(() => {
    const handle = setTimeout(async () => {
      setLoading(true);
      const result = await listUsers({ q: query.trim() || undefined });
      setLoading(false);
      if (result.data) setUsers(result.data);
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t("users.title")}</h1>
        <p className="text-sm text-gray-500">{t("users.subtitle")}</p>
      </div>
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("users.search")} className="pl-9" />
        {loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />}
      </div>
      <AdminUsersTable users={users} onUsersChange={setUsers} locale={locale} businesses={businesses} />
    </div>
  );
}
