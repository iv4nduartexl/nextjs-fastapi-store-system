import { getTranslations, getLocale } from "next-intl/server";
import Link from "next/link";
import { Wallet, ArrowLeft, ArrowRight } from "lucide-react";
import { fetchCurrentSession } from "@/components/actions/cashbox-action";
import POSClient from "./POSClient";

export default async function NewSalePage() {
  const [session, t, locale] = await Promise.all([
    fetchCurrentSession(),
    getTranslations("sales.pos"),
    getLocale(),
  ]);

  if (!session || session.status !== "open") {
    return (
      <div className="flex items-center justify-center min-h-[75vh] px-4">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-amber-200 bg-white shadow-lg overflow-hidden">
            <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-8 py-8 text-center">
              <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
                <Wallet className="h-8 w-8 text-white" strokeWidth={1.5} />
              </div>
              <h1 className="text-xl font-extrabold text-white">{t("cashboxClosed")}</h1>
            </div>
            <div className="px-8 py-7 text-center space-y-6">
              <p className="text-sm leading-relaxed text-gray-500">
                {t("cashboxClosedDesc")}
              </p>
              <Link
                href={`/${locale}/cashbox`}
                className="group flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-6 py-3.5 text-sm font-bold text-white shadow-md shadow-amber-200 transition-all hover:bg-amber-400 hover:-translate-y-0.5 hover:shadow-lg"
              >
                <Wallet className="h-4 w-4" />
                {t("cashboxClosedCta")}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link
                href={`/${locale}/dashboard`}
                className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                {t("cashboxClosedBack")}
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <POSClient />;
}
