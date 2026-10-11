"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Eye, KeyRound, Loader2, Power } from "lucide-react";

import {
  resetUserPassword,
  startImpersonation,
  updateUser,
  type AdminBusiness,
  type AdminUser,
} from "@/components/actions/admin-action";
import type { Role, TemporaryPassword } from "@/components/actions/team-action";
import { TemporaryPasswordDialog } from "@/components/team/temporary-password-dialog";
import { Link } from "@/i18n/routing";
import LocalDateSpan from "@/lib/LocalDateSpan";

interface AdminUsersTableProps {
  users: AdminUser[];
  onUsersChange: (users: AdminUser[]) => void;
  locale: string;
  /** When given, a "Business" column with a move-to selector is shown */
  businesses?: AdminBusiness[];
}

export function AdminUsersTable({ users, onUsersChange, locale, businesses }: AdminUsersTableProps) {
  const t = useTranslations("admin");
  const tRoles = useTranslations("account.roles");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<TemporaryPassword | null>(null);
  const [, startTransition] = useTransition();

  function replace(updated: AdminUser) {
    onUsersChange(users.map((u) => (u.id === updated.id ? updated : u)));
  }

  async function update(user: AdminUser, changes: { role?: Role; is_active?: boolean; business_id?: string }) {
    setBusyId(user.id);
    setError(null);
    const result = await updateUser(user.id, changes);
    setBusyId(null);
    if (result.data) replace(result.data);
    else setError(result.error ?? t("errors.generic"));
  }

  async function reset(user: AdminUser) {
    if (!confirm(t("users.confirmReset", { email: user.email }))) return;
    setBusyId(user.id);
    setError(null);
    const result = await resetUserPassword(user.id);
    setBusyId(null);
    if (result.data) {
      setRevealed(result.data);
      replace({ ...user, must_change_password: true });
    } else setError(result.error ?? t("errors.generic"));
  }

  function viewAs(user: AdminUser) {
    setBusyId(user.id);
    setError(null);
    startTransition(async () => {
      // Redirects into the app on success
      const result = await startImpersonation(user.id);
      setBusyId(null);
      if (result?.error) setError(result.error);
    });
  }

  if (users.length === 0) {
    return <p className="rounded-2xl border bg-white py-10 text-center text-sm text-gray-400">{t("users.empty")}</p>;
  }

  return (
    <div className="space-y-3">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      <div className="overflow-x-auto rounded-2xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">{t("users.user")}</th>
              {businesses && <th className="px-4 py-3 font-medium">{t("users.business")}</th>}
              <th className="px-4 py-3 font-medium">{t("users.role")}</th>
              <th className="px-4 py-3 font-medium">{t("status")}</th>
              <th className="hidden px-4 py-3 font-medium lg:table-cell">{t("users.lastLogin")}</th>
              <th className="px-4 py-3 text-right font-medium">{t("users.actions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map((user) => {
              const busy = busyId === user.id;
              const locked = user.is_superuser;
              return (
                <tr key={user.id} className={user.is_active ? "" : "bg-gray-50 text-gray-400"}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{user.full_name || user.username || user.email}</p>
                    <p className="text-xs text-gray-500">{user.email}</p>
                  </td>
                  {businesses && (
                    <td className="px-4 py-3">
                      {locked ? (
                        <span className="text-xs font-medium text-indigo-600">{t("users.superuser")}</span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {user.business_id && (
                            <Link href={`/admin/businesses/${user.business_id}`} className="text-xs text-gray-700 hover:underline">
                              {user.business_name}
                            </Link>
                          )}
                          <select
                            value=""
                            disabled={busy}
                            onChange={(e) => e.target.value && update(user, { business_id: e.target.value })}
                            className="max-w-[12rem] rounded-md border bg-white px-1.5 py-0.5 text-xs text-gray-500"
                            aria-label={t("users.moveTo")}
                          >
                            <option value="">{t("users.moveTo")}</option>
                            {businesses
                              .filter((b) => b.id !== user.business_id)
                              .map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.name}
                                </option>
                              ))}
                          </select>
                        </div>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <select
                      value={user.role}
                      disabled={busy || locked}
                      onChange={(e) => update(user, { role: e.target.value as Role })}
                      className="rounded-md border bg-white px-2 py-1 text-sm disabled:opacity-60"
                      aria-label={t("users.role")}
                    >
                      <option value="owner">{tRoles("owner")}</option>
                      <option value="cashier">{tRoles("cashier")}</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    {!user.is_active ? (
                      <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">{t("inactive")}</span>
                    ) : user.must_change_password ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">{t("users.pendingPassword")}</span>
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">{t("active")}</span>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 text-xs text-gray-500 lg:table-cell">
                    {user.last_login_at ? (
                      <LocalDateSpan
                        dateIso={user.last_login_at}
                        locale={locale}
                        options={{ day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }}
                      />
                    ) : (
                      t("users.never")
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {busy && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
                      <button
                        onClick={() => viewAs(user)}
                        disabled={busy || locked || !user.is_active || !user.business_id}
                        title={t("users.viewAs")}
                        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 disabled:opacity-40"
                      >
                        <Eye size={14} />
                        <span className="hidden xl:inline">{t("users.viewAs")}</span>
                      </button>
                      <button
                        onClick={() => reset(user)}
                        disabled={busy || locked}
                        title={t("users.resetPassword")}
                        aria-label={t("users.resetPassword")}
                        className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-40"
                      >
                        <KeyRound size={15} />
                      </button>
                      <button
                        onClick={() => update(user, { is_active: !user.is_active })}
                        disabled={busy || locked}
                        title={user.is_active ? t("users.deactivate") : t("users.activate")}
                        aria-label={user.is_active ? t("users.deactivate") : t("users.activate")}
                        className={`rounded-md p-1.5 disabled:opacity-40 ${
                          user.is_active ? "text-gray-400 hover:bg-red-50 hover:text-red-600" : "text-gray-400 hover:bg-emerald-50 hover:text-emerald-700"
                        }`}
                      >
                        <Power size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {revealed && (
        <TemporaryPasswordDialog email={revealed.email} password={revealed.temporary_password} onClose={() => setRevealed(null)} />
      )}
    </div>
  );
}
