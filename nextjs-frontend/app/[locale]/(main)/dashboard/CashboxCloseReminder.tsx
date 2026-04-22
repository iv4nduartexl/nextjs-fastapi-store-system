"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Wallet, X, ArrowRight, Moon } from "lucide-react";

const DISMISS_KEY = "cashbox_eod_dismissed";

export default function CashboxCloseReminder({ locale }: { locale: string }) {
  const t = useTranslations("dashboard");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 19) return; // only after 7 PM
    const dismissed = sessionStorage.getItem(DISMISS_KEY);
    if (dismissed) return;
    // Small delay so it slides in naturally after page load
    const timer = setTimeout(() => setVisible(true), 1200);
    return () => clearTimeout(timer);
  }, []);

  function dismiss() {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 w-80 rounded-2xl border border-violet-200 bg-white shadow-2xl shadow-violet-100 transition-all duration-500 ${
        visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
      }`}
    >
      {/* Top accent bar */}
      <div className="h-1 w-full rounded-t-2xl bg-gradient-to-r from-violet-500 to-indigo-500" />

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-100">
              <Moon className="h-4 w-4 text-violet-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-800 leading-tight">
                {t("eodReminderTitle")}
              </p>
            </div>
          </div>
          <button
            onClick={dismiss}
            className="mt-0.5 shrink-0 rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <p className="text-xs leading-relaxed text-gray-500 mb-4">
          {t("eodReminderDesc")}
        </p>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Link
            href={`/${locale}/cashbox`}
            className="group flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-violet-500"
          >
            <Wallet className="h-3.5 w-3.5" />
            {t("eodReminderCta")}
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <button
            onClick={dismiss}
            className="rounded-xl border border-gray-200 px-3 py-2.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700"
          >
            {t("eodReminderDismiss")}
          </button>
        </div>
      </div>
    </div>
  );
}
