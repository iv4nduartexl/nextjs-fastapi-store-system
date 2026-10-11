import { getLocale } from "next-intl/server";

import { MainShell } from "@/components/main-shell";
import { redirect } from "@/i18n/routing";
import { getMe } from "@/lib/session";

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  const locale = await getLocale();

  if (!me) redirect({ href: "/login", locale });
  // Temporary passwords must be replaced before using the app (not while the superuser views as them)
  if (me!.must_change_password && !me!.impersonated_by) redirect({ href: "/change-password", locale });
  // The platform administrator has no store of their own
  if (!me!.business_id) redirect({ href: me!.is_superuser ? "/admin" : "/login", locale });

  return <MainShell me={me!}>{children}</MainShell>;
}
