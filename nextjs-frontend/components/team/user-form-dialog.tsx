"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Role } from "@/components/actions/team-action";

export interface NewUserInput {
  email: string;
  username?: string;
  full_name?: string;
  role: Role;
}

interface UserFormDialogProps {
  title: string;
  submitLabel: string;
  /** Extra fields rendered above the user fields (e.g. business name) */
  children?: React.ReactNode;
  defaultRole?: Role;
  showRole?: boolean;
  onSubmit: (input: NewUserInput) => Promise<string | null>;
  onClose: () => void;
}

/** Create-user form shared by the owner's Team page and the admin panel. */
export function UserFormDialog({
  title,
  submitLabel,
  children,
  defaultRole = "cashier",
  showRole = true,
  onSubmit,
  onClose,
}: UserFormDialogProps) {
  const t = useTranslations("team");
  const tRoles = useTranslations("account.roles");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<Role>(defaultRole);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const message = await onSubmit({
      email: email.trim(),
      username: username.trim() || undefined,
      full_name: fullName.trim() || undefined,
      role,
    });
    setPending(false);
    if (message) setError(message);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      <form onSubmit={submit} className="mx-4 w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h3 className="font-semibold text-gray-800">{title}</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label={t("cancel")}>
            <X size={16} />
          </button>
        </div>
        <div className="space-y-4 px-5 py-5">
          {children}
          <div className="space-y-1.5">
            <Label htmlFor="user-email">{t("email")}</Label>
            <Input id="user-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="user-name">{t("fullName")}</Label>
              <Input id="user-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="user-username">{t("username")}</Label>
              <Input id="user-username" value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
          </div>
          {showRole && (
            <div className="space-y-1.5">
              <Label>{t("role")}</Label>
              <div className="grid grid-cols-2 gap-2">
                {(["cashier", "owner"] as Role[]).map((r) => (
                  <button
                    type="button"
                    key={r}
                    onClick={() => setRole(r)}
                    className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                      role === r ? "border-gray-900 bg-gray-900 text-white" : "hover:bg-gray-50"
                    }`}
                  >
                    <span className="block font-medium">{tRoles(r)}</span>
                    <span className={`block text-xs ${role === r ? "text-gray-300" : "text-gray-500"}`}>
                      {t(`roleHint.${r}`)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <p className="text-xs text-gray-500">{t("tempPasswordExplain")}</p>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending || !email.trim()}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitLabel}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
