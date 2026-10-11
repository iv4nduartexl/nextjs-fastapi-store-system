import { getLocale } from "next-intl/server";

import { AdminNav } from "@/components/admin/admin-nav";
import { redirect } from "@/i18n/routing";
import { getMe } from "@/lib/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  const locale = await getLocale();
  if (!me) redirect({ href: "/login", locale });
  if (me!.must_change_password) redirect({ href: "/change-password", locale });
  // Only the platform superuser, using their own session (not while viewing as someone)
  if (!me!.is_superuser || me!.impersonated_by) redirect({ href: "/dashboard", locale });

  return (
    <div className="min-h-screen bg-muted/40">
      <AdminNav email={me!.email} />
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
