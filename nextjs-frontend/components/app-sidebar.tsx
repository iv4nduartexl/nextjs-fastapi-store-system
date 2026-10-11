"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import {
  LayoutDashboard,
  MessageSquare,
  ShoppingBag,
  ShoppingCart,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { Link, usePathname } from "@/i18n/routing";
import { cn } from "@/lib/utils";

const NAV_ITEMS: { href: string; key: string; icon: LucideIcon }[] = [
  { href: "/dashboard", key: "dashboard", icon: LayoutDashboard },
  { href: "/products", key: "products", icon: ShoppingBag },
  { href: "/sales", key: "sales", icon: ShoppingCart },
  { href: "/purchases", key: "purchases", icon: Truck },
  { href: "/customers", key: "customers", icon: Users },
  { href: "/statistics", key: "statistics", icon: TrendingUp },
  { href: "/cashbox", key: "cashbox", icon: Wallet },
  { href: "/chat", key: "chat", icon: MessageSquare },
];

// Labels fade in only while the sidebar is expanded (mouse hover or keyboard focus)
const revealOnExpand =
  "whitespace-nowrap opacity-0 -translate-x-1 transition-[opacity,transform] duration-200 " +
  "group-hover/sidebar:opacity-100 group-hover/sidebar:translate-x-0 group-hover/sidebar:delay-100 " +
  "group-has-[:focus-visible]/sidebar:opacity-100 group-has-[:focus-visible]/sidebar:translate-x-0";

export function AppSidebar() {
  const t = useTranslations("nav");
  // Path without the locale prefix, e.g. "/sales/123"
  const pathname = usePathname();

  return (
    <aside
      aria-label={t("menu")}
      className={cn(
        "group/sidebar fixed inset-y-0 left-0 z-40 flex w-16 flex-col overflow-hidden border-r bg-background py-4",
        // Expands over the content (no layout shift); the short delay avoids opening on a passing cursor
        "transition-[width,box-shadow] duration-200 ease-out",
        "hover:w-56 hover:shadow-xl hover:delay-150",
        "has-[:focus-visible]:w-56 has-[:focus-visible]:shadow-xl",
        "motion-reduce:transition-none",
      )}
    >
      <Link
        href="/"
        className="mx-2 mb-6 flex h-12 items-center gap-3 rounded-xl px-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Image
          src="/images/vinta.png"
          alt=""
          width={32}
          height={32}
          className="h-8 w-8 shrink-0 object-cover transition-transform duration-200 hover:scale-105"
        />
        <span className={cn("text-sm font-semibold text-foreground", revealOnExpand)}>
          Store System
        </span>
      </Link>

      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map(({ href, key, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative mx-2 flex h-10 items-center gap-3 rounded-lg px-[14px] text-sm outline-none transition-colors",
                "focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              {active && (
                <span
                  aria-hidden
                  className="absolute -left-2 top-2 bottom-2 w-1 rounded-r-full bg-foreground"
                />
              )}
              <Icon className="h-5 w-5 shrink-0" />
              <span className={revealOnExpand}>{t(key)}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
