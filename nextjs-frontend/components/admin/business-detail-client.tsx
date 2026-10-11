"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, Check, Pencil, Power, UserPlus, X } from "lucide-react";

import {
  createUser,
  listUsers,
  updateBusiness,
  type AdminBusiness,
  type AdminUser,
} from "@/components/actions/admin-action";
import type { TemporaryPassword } from "@/components/actions/team-action";
import { AdminUsersTable } from "@/components/admin/admin-users-table";
import { TemporaryPasswordDialog } from "@/components/team/temporary-password-dialog";
import { UserFormDialog } from "@/components/team/user-form-dialog";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/routing";
import LocalDateSpan from "@/lib/LocalDateSpan";

interface BusinessDetailClientProps {
  business: AdminBusiness;
  initialUsers: AdminUser[];
  businesses: AdminBusiness[];
  locale: string;
}

export function BusinessDetailClient({ business: initial, initialUsers, businesses, locale }: BusinessDetailClientProps) {
  const t = useTranslations("admin");
  const [business, setBusiness] = useState(initial);
  const [users, setUsers] = useState(initialUsers);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(initial.name);
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState<TemporaryPassword | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(changes: { name?: string; is_active?: boolean }) {
    if (changes.is_active === false && !confirm(t("business.confirmDeactivate", { name: business.name }))) return;
    setError(null);
    const result = await updateBusiness(business.id, changes);
    if (result.data) {
      setBusiness(result.data);
      setEditingName(false);
    } else setError(result.error ?? t("errors.generic"));
  }

  // Users moved to another business disappear from this list
  function onUsersChange(next: AdminUser[]) {
    setUsers(next.filter((u) => u.business_id === business.id));
  }

  return (
    <div className="space-y-6">
      <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft className="h-4 w-4" />
        {t("business.back")}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border bg-white p-5">
        <div className="space-y-1">
          {editingName ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && name.trim() && save({ name: name.trim() })}
                className="rounded-md border px-2 py-1 text-xl font-bold"
                maxLength={120}
              />
              <button onClick={() => name.trim() && save({ name: name.trim() })} className="p-1 text-gray-500 hover:text-gray-900" aria-label={t("save")}>
                <Check size={18} />
              </button>
              <button onClick={() => { setName(business.name); setEditingName(false); }} className="p-1 text-gray-500 hover:text-gray-900" aria-label={t("cancel")}>
                <X size={18} />
              </button>
            </div>
          ) : (
            <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
              {business.name}
              <button onClick={() => setEditingName(true)} className="text-gray-400 hover:text-gray-700" aria-label={t("rename")}>
                <Pencil size={15} />
              </button>
            </h1>
          )}
          <p className="text-sm text-gray-500">
            {t("business.stats", { users: business.user_count, sales: business.sales_count })}
            {" · "}
            {t("business.created")}{" "}
            <LocalDateSpan dateIso={business.created_at} locale={locale} options={{ day: "numeric", month: "short", year: "numeric" }} />
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${business.is_active ? "bg-emerald-100 text-emerald-800" : "bg-gray-200 text-gray-600"}`}>
            {business.is_active ? t("active") : t("inactive")}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => save({ is_active: !business.is_active })}
            className={business.is_active ? "gap-1.5 border-red-200 text-red-600 hover:bg-red-50" : "gap-1.5"}
          >
            <Power className="h-4 w-4" />
            {business.is_active ? t("business.deactivate") : t("business.activate")}
          </Button>
        </div>
      </div>

      {!business.is_active && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{t("business.inactiveHint")}</p>
      )}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">{t("business.users")}</h2>
        <Button size="sm" onClick={() => setCreating(true)} className="gap-2">
          <UserPlus className="h-4 w-4" />
          {t("users.add")}
        </Button>
      </div>
      <AdminUsersTable users={users} onUsersChange={onUsersChange} locale={locale} businesses={businesses} />

      {creating && (
        <UserFormDialog
          title={t("users.addTo", { name: business.name })}
          submitLabel={t("users.create")}
          onClose={() => setCreating(false)}
          onSubmit={async (input) => {
            const result = await createUser({ ...input, business_id: business.id });
            if (!result.data) return result.error ?? t("errors.generic");
            setCreating(false);
            setRevealed(result.data);
            const refreshed = await listUsers({ business_id: business.id });
            if (refreshed.data) setUsers(refreshed.data);
            return null;
          }}
        />
      )}
      {revealed && (
        <TemporaryPasswordDialog email={revealed.email} password={revealed.temporary_password} onClose={() => setRevealed(null)} />
      )}
    </div>
  );
}
