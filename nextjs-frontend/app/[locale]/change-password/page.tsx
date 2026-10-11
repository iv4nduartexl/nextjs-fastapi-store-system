import { getLocale } from "next-intl/server";

import { ChangePasswordForm } from "@/components/change-password-form";
import { redirect } from "@/i18n/routing";
import { getMe } from "@/lib/session";

export default async function ChangePasswordPage() {
  const me = await getMe();
  if (!me) redirect({ href: "/login", locale: await getLocale() });

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <ChangePasswordForm
        forced={me!.must_change_password}
        email={me!.email}
        nextHref={me!.business_id ? "/dashboard" : "/admin"}
      />
    </div>
  );
}
