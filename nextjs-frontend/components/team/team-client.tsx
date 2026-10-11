"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, KeyRound, Loader2, Pencil, Power, UserPlus, X } from "lucide-react";

import {
  createTeamMember,
  renameBusiness,
  resetTeamMemberPassword,
  updateTeamMember,
  type Role,
  type TeamUser,
  type TemporaryPassword,
} from "@/components/actions/team-action";
import { TemporaryPasswordDialog } from "@/components/team/temporary-password-dialog";
import { UserFormDialog } from "@/components/team/user-form-dialog";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/routing";
import LocalDateSpan from "@/lib/LocalDateSpan";

interface TeamClientProps {
  initialUsers: TeamUser[];
  businessName: string;
  currentUserId: string;
  locale: string;
}

const KNOWN_ERRORS = ["last_owner", "cannot_demote_yourself", "cannot_deactivate_yourself"];

export function TeamClient({ initialUsers, businessName, currentUserId, locale }: TeamClientProps) {
  const t = useTranslations("team");
  const tRoles = useTranslations("account.roles");
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState<TemporaryPassword | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(businessName);
  const [editingName, setEditingName] = useState(false);

  function message(raw?: string) {
    if (raw && KNOWN_ERRORS.includes(raw)) return t(`errors.${raw}`);
    if (raw === "Email already in use") return t("errors.email_taken");
    if (raw === "Username already in use") return t("errors.username_taken");
    return raw ?? t("errors.generic");
  }

  async function update(user: TeamUser, changes: { role?: Role; is_active?: boolean }) {
    setBusyId(user.id);
    setError(null);
    const result = await updateTeamMember(user.id, changes);
    setBusyId(null);
    if (result.data) setUsers((prev) => prev.map((u) => (u.id === user.id ? result.data! : u)));
    else setError(message(result.error));
  }

  async function resetPassword(user: TeamUser) {
    if (!confirm(t("confirmReset", { email: user.email }))) return;
    setBusyId(user.id);
    setError(null);
    const result = await resetTeamMemberPassword(user.id);
    setBusyId(null);
    if (result.data) {
      setRevealed(result.data);
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, must_change_password: true } : u)));
    } else setError(message(result.error));
  }

  async function saveName() {
    const result = await renameBusiness(name.trim());
    if (result.data) {
      setEditingName(false);
      router.refresh();
    } else setError(message(result.error));
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{t("business")}</p>
          {editingName ? (
            <div className="mt-1 flex items-center gap-2">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && name.trim() && saveName()}
                className="rounded-md border px-2 py-1 text-xl font-bold"
                maxLength={120}
              />
              <button onClick={saveName} disabled={!name.trim()} className="p-1 text-gray-500 hover:text-gray-900" aria-label={t("save")}>
                <Check size={18} />
              </button>
              <button
                onClick={() => {
                  setName(businessName);
                  setEditingName(false);
                }}
                className="p-1 text-gray-500 hover:text-gray-900"
                aria-label={t("cancel")}
              >
                <X size={18} />
              </button>
            </div>
          ) : (
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-gray-900">
              {name}
              <button onClick={() => setEditingName(true)} className="text-gray-400 hover:text-gray-700" aria-label={t("rename")}>
                <Pencil size={15} />
              </button>
            </h1>
          )}
          <p className="text-sm text-gray-500">{t("subtitle")}</p>
        </div>
        <Button onClick={() => setCreating(true)} className="gap-2">
          <UserPlus className="h-4 w-4" />
          {t("addUser")}
        </Button>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-2xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">{t("user")}</th>
              <th className="px-4 py-3 font-medium">{t("role")}</th>
              <th className="px-4 py-3 font-medium">{t("status")}</th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">{t("lastLogin")}</th>
              <th className="px-4 py-3 text-right font-medium">{t("actions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map((user) => {
              const isMe = user.id === currentUserId;
              const busy = busyId === user.id;
              return (
                <tr key={user.id} className={user.is_active ? "" : "bg-gray-50 text-gray-400"}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">
                      {user.full_name || user.username || user.email}
                      {isMe && <span className="ml-1.5 text-xs font-normal text-gray-400">({t("you")})</span>}
                    </p>
                    <p className="text-xs text-gray-500">{user.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={user.role}
                      disabled={busy || isMe}
                      onChange={(e) => update(user, { role: e.target.value as Role })}
                      className="rounded-md border bg-white px-2 py-1 text-sm disabled:opacity-60"
                      aria-label={t("role")}
                    >
                      <option value="owner">{tRoles("owner")}</option>
                      <option value="cashier">{tRoles("cashier")}</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    {!user.is_active ? (
                      <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">{t("inactive")}</span>
                    ) : user.must_change_password ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">{t("pendingPassword")}</span>
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">{t("active")}</span>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 text-xs text-gray-500 md:table-cell">
                    {user.last_login_at ? (
                      <LocalDateSpan
                        dateIso={user.last_login_at}
                        locale={locale}
                        options={{ day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }}
                      />
                    ) : (
                      t("never")
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {busy && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
                      <button
                        onClick={() => resetPassword(user)}
                        disabled={busy || isMe}
                        title={t("resetPassword")}
                        aria-label={t("resetPassword")}
                        className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-40"
                      >
                        <KeyRound size={15} />
                      </button>
                      <button
                        onClick={() => update(user, { is_active: !user.is_active })}
                        disabled={busy || isMe}
                        title={user.is_active ? t("deactivate") : t("activate")}
                        aria-label={user.is_active ? t("deactivate") : t("activate")}
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

      {creating && (
        <UserFormDialog
          title={t("addUser")}
          submitLabel={t("create")}
          onClose={() => setCreating(false)}
          onSubmit={async (input) => {
            const result = await createTeamMember(input);
            if (!result.data) return message(result.error);
            setCreating(false);
            setRevealed(result.data);
            setUsers((prev) => [
              ...prev,
              {
                id: result.data!.user_id,
                email: result.data!.email,
                username: input.username ?? null,
                full_name: input.full_name ?? null,
                role: input.role,
                is_active: true,
                must_change_password: true,
                last_login_at: null,
              },
            ]);
            return null;
          }}
        />
      )}
      {revealed && (
        <TemporaryPasswordDialog
          email={revealed.email}
          password={revealed.temporary_password}
          onClose={() => setRevealed(null)}
        />
      )}
    </div>
  );
}
