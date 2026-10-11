"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, KeyRound, Loader2 } from "lucide-react";

import { changePassword } from "@/components/actions/account-action";
import { logout } from "@/components/actions/logout-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useRouter } from "@/i18n/routing";

interface ChangePasswordFormProps {
  /** True when the user signed in with a temporary password and must replace it */
  forced: boolean;
  email: string;
  nextHref: string;
}

export function ChangePasswordForm({ forced, email, nextHref }: ChangePasswordFormProps) {
  const t = useTranslations("account");
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) {
      setErrors([t("passwordsDontMatch")]);
      return;
    }
    setPending(true);
    setErrors([]);
    const result = await changePassword(current, next);
    setPending(false);
    if (result.ok) {
      setDone(true);
      router.replace(nextHref);
      router.refresh();
      return;
    }
    if (result.error === "invalid_password") {
      setErrors(result.reasons?.length ? result.reasons : [t("errors.invalid_password")]);
    } else {
      setErrors([t(`errors.${result.error ?? "generic"}`)]);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
          <KeyRound className="h-5 w-5 text-gray-600" />
        </div>
        <CardTitle className="text-2xl">{forced ? t("setNewPasswordTitle") : t("changePassword")}</CardTitle>
        <CardDescription>
          {forced ? t("forcedDescription") : t("changeDescription")}
          <span className="mt-1 block font-medium text-gray-700">{email}</span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="current">{forced ? t("temporaryPassword") : t("currentPassword")}</Label>
            <Input id="current" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new">{t("newPassword")}</Label>
            <Input id="new" type="password" autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} />
            <p className="text-xs text-gray-500">{t("passwordRules")}</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirm">{t("confirmPassword")}</Label>
            <Input id="confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>

          {errors.length > 0 && (
            <ul className="space-y-1 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )}
          {done && (
            <p className="flex items-center gap-1.5 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> {t("passwordChanged")}
            </p>
          )}

          <Button type="submit" disabled={pending || done} className="w-full">
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("savePassword")}
          </Button>
          {forced ? (
            <button type="button" onClick={() => logout()} className="text-sm text-gray-500 hover:text-gray-800">
              {t("signOut")}
            </button>
          ) : (
            <Link href={nextHref} className="text-center text-sm text-gray-500 hover:text-gray-800">
              {t("back")}
            </Link>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
