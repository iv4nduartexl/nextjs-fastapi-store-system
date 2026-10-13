"use client";

import { useTranslations } from "next-intl";
import { Banknote, CreditCard, Crown, Users } from "lucide-react";

import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/pos/sale";

const LOOK: Record<PaymentMethod, { Icon: React.ElementType; accent: string; accentActive: string }> = {
  cash: { Icon: Banknote, accent: "bg-emerald-50 text-emerald-600", accentActive: "bg-emerald-500 text-white" },
  card: { Icon: CreditCard, accent: "bg-blue-50 text-blue-600", accentActive: "bg-blue-500 text-white" },
  credit: { Icon: Users, accent: "bg-amber-50 text-amber-600", accentActive: "bg-amber-500 text-white" },
  internal: { Icon: Crown, accent: "bg-purple-50 text-purple-600", accentActive: "bg-purple-500 text-white" },
};

/** The 4 payment methods as big tiles: all visible at once, no scrolling. */
export function PaymentTiles({ value, onChange }: { value: PaymentMethod; onChange: (method: PaymentMethod) => void }) {
  const t = useTranslations("sales.pos");
  return (
    <div role="radiogroup" aria-label={t("paymentMethod")} className="grid grid-cols-2 gap-2.5">
      {PAYMENT_METHODS.map(({ method, key }, index) => {
        const { Icon, accent, accentActive } = LOOK[method];
        const active = value === method;
        return (
          <button
            key={method}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(method)}
            title={`${t(`methods.${method}`)} (${key} · ${index + 1})`}
            className={`relative flex items-center gap-3 rounded-2xl border-2 p-3 text-left transition-all active:scale-[0.98] ${
              active
                ? "border-gray-900 bg-gray-900 text-white shadow-lg shadow-gray-900/10"
                : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
            }`}
          >
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${active ? accentActive : accent}`}
            >
              <Icon size={20} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold leading-tight">{t(`methods.${method}`)}</span>
              <span className={`block text-[11px] leading-tight mt-0.5 ${active ? "text-gray-300" : "text-gray-500"}`}>
                {t(`methodHints.${method}`)}
              </span>
            </span>
            <kbd
              className={`absolute right-2 top-2 hidden md:inline rounded border px-1 font-mono text-[9px] leading-tight ${
                active ? "border-white/30 text-white/70" : "border-gray-200 text-gray-400"
              }`}
            >
              {key}
            </kbd>
          </button>
        );
      })}
    </div>
  );
}
