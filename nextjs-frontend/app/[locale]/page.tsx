import { getTranslations, getLocale } from "next-intl/server";
import Link from "next/link";
import {
  ShoppingCart,
  Boxes,
  PackagePlus,
  Wallet,
  Users,
  ReceiptText,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";

export default async function Home() {
  const t = await getTranslations("home");
  const locale = await getLocale();

  const features = [
    {
      icon: <ShoppingCart className="w-6 h-6" />,
      label: t("featurePos"),
      desc: t("featurePosDesc"),
      bg: "bg-emerald-50",
      iconColor: "text-emerald-600",
      ring: "ring-emerald-100",
    },
    {
      icon: <Boxes className="w-6 h-6" />,
      label: t("featureInventory"),
      desc: t("featureInventoryDesc"),
      bg: "bg-orange-50",
      iconColor: "text-orange-600",
      ring: "ring-orange-100",
    },
    {
      icon: <PackagePlus className="w-6 h-6" />,
      label: t("featurePurchases"),
      desc: t("featurePurchasesDesc"),
      bg: "bg-amber-50",
      iconColor: "text-amber-600",
      ring: "ring-amber-100",
    },
    {
      icon: <Wallet className="w-6 h-6" />,
      label: t("featureCashbox"),
      desc: t("featureCashboxDesc"),
      bg: "bg-violet-50",
      iconColor: "text-violet-600",
      ring: "ring-violet-100",
    },
    {
      icon: <Users className="w-6 h-6" />,
      label: t("featureCustomers"),
      desc: t("featureCustomersDesc"),
      bg: "bg-sky-50",
      iconColor: "text-sky-600",
      ring: "ring-sky-100",
    },
    {
      icon: <ReceiptText className="w-6 h-6" />,
      label: t("featureSales"),
      desc: t("featureSalesDesc"),
      bg: "bg-blue-50",
      iconColor: "text-blue-600",
      ring: "ring-blue-100",
    },
  ];

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* ── Navbar ── */}
      <header className="sticky top-0 z-50 border-b border-gray-100 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600">
              <ShoppingCart className="h-4 w-4 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-base font-bold text-gray-900 tracking-tight">
              Despensa Alicia
            </span>
          </div>
          <nav className="flex items-center gap-3">
            <Link
              href={`/${locale}/login`}
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
            >
              {t("heroCtaSecondary")}
            </Link>
            <Link
              href={`/${locale}/dashboard`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
            >
              {t("heroCta")}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-gray-950 via-emerald-950 to-gray-950 px-6 py-28 text-center">
        {/* Grid pattern overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(to right,#ffffff 1px,transparent 1px),linear-gradient(to bottom,#ffffff 1px,transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        {/* Glow blobs */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[500px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/10 blur-3xl" />

        <div className="relative z-10 max-w-3xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Sistema de Gestión de Tienda
          </div>

          <h1 className="mb-5 text-5xl font-extrabold leading-[1.1] tracking-tight text-white md:text-6xl">
            {t("heroTitle")}
          </h1>

          <p className="mx-auto mb-10 max-w-xl text-lg leading-relaxed text-gray-400">
            {t("heroSubtitle")}
          </p>

          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href={`/${locale}/dashboard`}
              className="group inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-8 py-4 text-base font-bold text-white shadow-lg shadow-emerald-500/25 transition-all hover:bg-emerald-400 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-emerald-500/30"
            >
              {t("heroCta")}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href={`/${locale}/login`}
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-8 py-4 text-base font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/10 hover:-translate-y-0.5"
            >
              {t("heroCtaSecondary")}
            </Link>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="bg-gray-50 px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 text-center">
            <h2 className="mb-3 text-3xl font-extrabold tracking-tight text-gray-900 md:text-4xl">
              {t("featuresTitle")}
            </h2>
            <p className="mx-auto max-w-xl text-base text-gray-500">
              {t("featuresSubtitle")}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.label}
                className={`group rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md`}
              >
                <div
                  className={`mb-4 inline-flex rounded-xl p-3 ring-4 ${f.bg} ${f.ring}`}
                >
                  <span className={f.iconColor}>{f.icon}</span>
                </div>
                <h3 className="mb-1.5 text-base font-bold text-gray-900">
                  {f.label}
                </h3>
                <p className="text-sm leading-relaxed text-gray-500">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section className="bg-emerald-600 px-6 py-20 text-center">
        <div className="mx-auto max-w-2xl">
          <h2 className="mb-3 text-3xl font-extrabold text-white">
            {t("ctaTitle")}
          </h2>
          <p className="mb-8 text-base text-emerald-100">{t("ctaDesc")}</p>
          <Link
            href={`/${locale}/dashboard`}
            className="group inline-flex items-center gap-2 rounded-xl bg-white px-8 py-4 text-base font-bold text-emerald-700 shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl"
          >
            {t("ctaButton")}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-100 bg-white px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-sm text-gray-400 sm:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-600">
              <ShoppingCart className="h-3 w-3 text-white" strokeWidth={2.5} />
            </div>
            <span className="font-semibold text-gray-700">Despensa Alicia</span>
          </div>
          <p>
            © {new Date().getFullYear()} Despensa Alicia. {t("footerRights")}
          </p>
        </div>
      </footer>
    </div>
  );
}
