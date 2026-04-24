import { getTranslations, getLocale } from "next-intl/server";
import Link from "next/link";
import {
  ShoppingCart,
  ReceiptText,
  PackagePlus,
  Boxes,
  Users,
  Wallet,
  TrendingUp,
  ArrowRight,
  AlertTriangle,
} from "lucide-react";
import { fetchCurrentSession } from "@/components/actions/cashbox-action";
import CashboxCloseReminder from "./CashboxCloseReminder";

export default async function DashboardPage() {
  const [t, locale, session] = await Promise.all([
    getTranslations("dashboard"),
    getLocale(),
    fetchCurrentSession(),
  ]);

  const cashboxOpen = session?.status === "open";

  const modules = [
    {
      href: `/${locale}/sales`,
      icon: <ReceiptText className="w-6 h-6" />,
      label: t("salesHistory"),
      desc: t("salesHistoryDesc"),
      iconBg: "bg-blue-100 text-blue-600",
      border: "hover:border-blue-300",
      accent: "group-hover:text-blue-600",
      highlight: false,
    },
    {
      href: `/${locale}/purchases/new`,
      icon: <PackagePlus className="w-6 h-6" />,
      label: t("newPurchase"),
      desc: t("newPurchaseDesc"),
      iconBg: "bg-amber-100 text-amber-600",
      border: "hover:border-amber-300",
      accent: "group-hover:text-amber-600",
      highlight: false,
    },
    {
      href: `/${locale}/cashbox`,
      icon: <Wallet className="w-6 h-6" />,
      label: t("cashbox"),
      desc: t("cashboxDesc"),
      iconBg: cashboxOpen
        ? "bg-violet-100 text-violet-600"
        : "bg-amber-100 text-amber-600",
      border: cashboxOpen
        ? "hover:border-violet-300"
        : "hover:border-amber-400",
      accent: cashboxOpen
        ? "group-hover:text-violet-600"
        : "group-hover:text-amber-600",
      highlight: !cashboxOpen,
    },
    {
      href: `/${locale}/products`,
      icon: <Boxes className="w-6 h-6" />,
      label: t("inventory"),
      desc: t("inventoryDesc"),
      iconBg: "bg-orange-100 text-orange-600",
      border: "hover:border-orange-300",
      accent: "group-hover:text-orange-600",
      highlight: false,
    },
    {
      href: `/${locale}/customers`,
      icon: <Users className="w-6 h-6" />,
      label: t("customers"),
      desc: t("customersDesc"),
      iconBg: "bg-sky-100 text-sky-600",
      border: "hover:border-sky-300",
      accent: "group-hover:text-sky-600",
      highlight: false,
    },
    {
      href: `/${locale}/purchases`,
      icon: <TrendingUp className="w-6 h-6" />,
      label: t("purchasesHistory"),
      desc: t("purchasesHistoryDesc"),
      iconBg: "bg-rose-100 text-rose-600",
      border: "hover:border-rose-300",
      accent: "group-hover:text-rose-600",
      highlight: false,
    },
  ];

  return (
    <div className="space-y-5">
      {/* End-of-day cashbox close reminder (client, only shows after 7 PM) */}
      {cashboxOpen && <CashboxCloseReminder locale={locale} />}
      {/* Cashbox closed banner */}
      {!cashboxOpen && (
        <Link
          href={`/${locale}/cashbox`}
          className="group flex items-center gap-4 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 transition-all hover:border-amber-300 hover:bg-amber-100"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 ring-4 ring-amber-200">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-amber-800">
              {t("cashboxBanner")}
            </p>
            <p className="text-xs text-amber-600 leading-snug">
              {t("cashboxBannerDesc")}
            </p>
          </div>
          <div className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition-colors group-hover:bg-amber-600">
            {t("cashboxBannerCta")}
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </div>
        </Link>
      )}

      {/* Hero: Nueva Venta */}
      <Link
        href={`/${locale}/sales/new`}
        className="group relative flex items-center justify-between overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 p-8 shadow-lg transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5"
      >
        <div className="relative z-10 space-y-1.5 max-w-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-200">
            {t("quickAction")}
          </p>
          <h2 className="text-4xl font-extrabold text-white leading-tight">
            {t("newSale")}
          </h2>
          <p className="text-emerald-100 text-sm leading-relaxed">
            {t("newSaleDesc")}
          </p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/20 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition-colors group-hover:bg-white/30">
            {t("startSelling")}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </div>
        </div>
        <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 opacity-[0.12] transition-opacity group-hover:opacity-[0.18]">
          <ShoppingCart className="h-48 w-48 text-white" strokeWidth={1} />
        </div>
      </Link>

      {/* Module grid */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {modules.map((mod) => (
          <Link
            key={mod.href}
            href={mod.href}
            className={`group flex flex-col gap-4 rounded-xl border bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${mod.border} ${
              mod.highlight
                ? "border-amber-300 ring-2 ring-amber-200 bg-amber-50"
                : "border-gray-200"
            }`}
          >
            <div className="flex items-start justify-between">
              <div className={`rounded-xl p-2.5 ${mod.iconBg}`}>{mod.icon}</div>
              <div className="flex items-center gap-1.5">
                {mod.highlight && (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full leading-none">
                    {t("cashboxBanner")}
                  </span>
                )}
                <ArrowRight
                  className={`h-4 w-4 text-gray-300 transition-all duration-200 group-hover:translate-x-0.5 ${mod.accent}`}
                />
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800 leading-snug">
                {mod.label}
              </p>
              <p className="mt-0.5 text-xs text-gray-400 leading-snug">
                {mod.desc}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
