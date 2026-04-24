"use client";

import { useActionState } from "react";
import { notFound, useSearchParams } from "next/navigation";
import { passwordResetConfirm } from "@/components/actions/password-reset-action";
import { SubmitButton } from "@/components/ui/submitButton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Suspense } from "react";
import { FieldError, FormError } from "@/components/ui/FormError";
import { useTranslations } from "next-intl";

function ResetPasswordForm() {
  const [state, dispatch] = useActionState(passwordResetConfirm, undefined);
  const t = useTranslations("passwordResetConfirm");
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  if (!token) {
    notFound();
  }

  return (
    <form action={dispatch}>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">{t("title")}</CardTitle>
          <CardDescription>
            {t("description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="password">{t("password")}</Label>
            <Input id="password" name="password" type="password" required />
          </div>
          <FieldError state={state} field="password" />
          <div className="grid gap-2">
            <Label htmlFor="passwordConfirm">{t("passwordConfirm")}</Label>
            <Input
              id="passwordConfirm"
              name="passwordConfirm"
              type="password"
              required
            />
          </div>
          <FieldError state={state} field="passwordConfirm" />
          <input
            type="hidden"
            id="resetToken"
            name="resetToken"
            value={token}
            readOnly
          />
          <SubmitButton text={t("send")} />
          <FormError state={state} />
        </CardContent>
      </Card>
    </form>
  );
}

export default function Page() {
  return (
    <div className="flex h-screen w-full items-center justify-center px-4">
      <Suspense fallback={<div>Loading reset form...</div>}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
