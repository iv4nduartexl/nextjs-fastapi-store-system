"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Building2, ChevronRight, Plus, Search } from "lucide-react";

import { createBusiness, type AdminBusiness } from "@/components/actions/admin-action";
import type { TemporaryPassword } from "@/components/actions/team-action";
import { TemporaryPasswordDialog } from "@/components/team/temporary-password-dialog";
import { UserFormDialog } from "@/components/team/user-form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/routing";
import LocalDateSpan from "@/lib/LocalDateSpan";

export function BusinessesClient({
  initialBusinesses,
  locale,
}: {
  initialBusinesses: AdminBusiness[];
  locale: string;
}) {
  const t = useTranslations("admin");
  const [businesses, setBusinesses] = useState(initialBusinesses);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [revealed, setRevealed] = useState<TemporaryPassword | null>(null);

  const filtered = useMemo(
    () => businesses.filter((b) => b.name.toLowerCase().includes(query.trim().toLowerCase())),
    [businesses, query],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("businesses.title")}</h1>
          <p className="text-sm text-gray-500">{t("businesses.subtitle", { count: businesses.length })}</p>
        </div>
        <Button onClick={() => setCreating(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          {t("businesses.create")}
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("businesses.search")} className="pl-9" />
      </div>

      <div className="overflow-hidden rounded-2xl border bg-white">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-sm text-gray-400">
            <Building2 className="h-8 w-8 text-gray-300" />
            {t("businesses.empty")}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">{t("businesses.name")}</th>
                <th className="px-4 py-3 font-medium">{t("status")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("businesses.users")}</th>
                <th className="hidden px-4 py-3 text-right font-medium sm:table-cell">{t("businesses.sales")}</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">{t("businesses.lastActivity")}</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((b) => (
                <tr key={b.id} className="group hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={`/admin/businesses/${b.id}`} className="font-medium text-gray-900 hover:underline">
                      {b.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        b.is_active ? "bg-emerald-100 text-emerald-800" : "bg-gray-200 text-gray-600"
                      }`}
                    >
                      {b.is_active ? t("active") : t("inactive")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{b.user_count}</td>
                  <td className="hidden px-4 py-3 text-right tabular-nums sm:table-cell">{b.sales_count}</td>
                  <td className="hidden px-4 py-3 text-xs text-gray-500 md:table-cell">
                    {b.last_activity_at ? (
                      <LocalDateSpan dateIso={b.last_activity_at} locale={locale} options={{ day: "numeric", month: "short", year: "numeric" }} />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="pr-3">
                    <Link href={`/admin/businesses/${b.id}`} aria-label={b.name} className="text-gray-300 group-hover:text-gray-600">
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {creating && (
        <UserFormDialog
          title={t("businesses.create")}
          submitLabel={t("businesses.createSubmit")}
          showRole={false}
          defaultRole="owner"
          onClose={() => setCreating(false)}
          onSubmit={async (input) => {
            if (!businessName.trim()) return t("businesses.nameRequired");
            const result = await createBusiness({
              name: businessName.trim(),
              owner_email: input.email,
              owner_username: input.username,
              owner_full_name: input.full_name,
            });
            if (!result.data) return result.error ?? t("errors.generic");
            setBusinesses((prev) => [...prev, result.data!.business].sort((a, b) => a.name.localeCompare(b.name)));
            setBusinessName("");
            setCreating(false);
            setRevealed(result.data.owner);
            return null;
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="business-name">{t("businesses.name")}</Label>
            <Input id="business-name" required value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
          </div>
          <p className="border-t pt-3 text-xs font-semibold uppercase tracking-wide text-gray-400">{t("businesses.firstOwner")}</p>
        </UserFormDialog>
      )}
      {revealed && (
        <TemporaryPasswordDialog email={revealed.email} password={revealed.temporary_password} onClose={() => setRevealed(null)} />
      )}
    </div>
  );
}
