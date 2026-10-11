import { redirect } from "@/i18n/routing";
import { getLocale } from "next-intl/server";

// Public sign-up is closed: accounts are created by the administrator or a business owner.
export default async function RegisterPage() {
  redirect({ href: "/login", locale: await getLocale() });
}
