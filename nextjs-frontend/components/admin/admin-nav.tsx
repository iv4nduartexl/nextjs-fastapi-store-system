"use client";

import { useTranslations } from "next-intl";
import { Building2, LogOut, ScrollText, ShieldCheck, Users } from "lucide-react";

import { logout } from "@/components/actions/logout-action";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Link, usePathname } from "@/i18n/routing";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/admin", key: "businesses", icon: Building2 },
  { href: "/admin/users", key: "users", icon: Users },
  { href: "/admin/audit", key: "audit", icon: ScrollText },
] as const;

export function AdminNav({ email }: { email: string }) {
  const t = useTranslations("admin");
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/admin") return pathname === "/admin" || pathname.startsWith("/admin/businesses");
    return pathname.startsWith(href);
  }

  return (
    <header className="sticky top-0 z-30 border-b bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-2 font-semibold text-gray-900">
          <ShieldCheck className="h-5 w-5 text-indigo-600" />
          <span className="hidden sm:inline">{t("title")}</span>
        </div>
        <nav className="flex items-center gap-1">
          {LINKS.map(({ href, key, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? "page" : undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors",
                isActive(href) ? "bg-gray-100 font-medium text-gray-900" : "text-gray-500 hover:bg-gray-50 hover:text-gray-900",
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{t(`nav.${key}`)}</span>
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <LanguageSwitcher />
          <span className="hidden text-xs text-gray-500 md:inline">{email}</span>
          <button
            onClick={() => logout()}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-900"
            title={t("logout")}
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
