"use client";

import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { login } from "@/components/actions/login-action";
import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/submitButton";
import { FieldError, FormError } from "@/components/ui/FormError";
import { useTranslations } from "next-intl";
import { LanguageSwitcher } from "@/components/language-switcher";

export default function Page() {
  const [state, dispatch] = useActionState(login, undefined);
  const t = useTranslations("login");
  return (
    <div className="flex h-screen w-full items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      <form action={dispatch}>
        <Card className="w-full max-w-sm rounded-lg shadow-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-semibold text-gray-800 dark:text-white">
              {t("title")}
            </CardTitle>
            <CardDescription className="text-sm text-gray-600 dark:text-gray-400">
              {t("description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 p-6">
            <div className="grid gap-3">
              <Label
                htmlFor="username"
                className="text-gray-700 dark:text-gray-300"
              >
                {t("emailOrUsername")}
              </Label>
              <Input
                id="username"
                name="username"
                type="text"
                placeholder={t("emailOrUsernamePlaceholder")}
                required
                className="border-gray-300 dark:border-gray-600"
              />
              <FieldError state={state} field="username" />
            </div>
            <div className="grid gap-3">
              <Label
                htmlFor="password"
                className="text-gray-700 dark:text-gray-300"
              >
                {t("password")}
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                className="border-gray-300 dark:border-gray-600"
              />
              <FieldError state={state} field="password" />
              <Link
                href="/password-recovery"
                className="ml-auto inline-block text-sm text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-500"
              >
                {t("forgotPassword")}
              </Link>
            </div>
            <SubmitButton text={t("signIn")} />
            <FormError state={state} />
            <div className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
              {t("noAccount")}{" "}
              <Link
                href="/register"
                className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-500"
              >
                {t("signUp")}
              </Link>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
