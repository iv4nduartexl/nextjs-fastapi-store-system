"use client";

import { forwardRef, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Search, X } from "lucide-react";

import { PartialPaymentInput } from "@/components/Pages/sales/new/PosClient/partial-payment-input";
import type { CustomerRead } from "@/components/actions/customers-action";
import { formatCurrency } from "@/lib/currency";

/** Credit sale: pick the customer (debounced search) and an optional down payment. */
export const CreditCustomer = forwardRef<
  HTMLInputElement,
  {
    customer: CustomerRead | null;
    onCustomer: (customer: CustomerRead | null) => void;
    partialPayment: number | null;
    onPartialPayment: (amount: number | null) => void;
  }
>(function CreditCustomer({ customer, onCustomer, partialPayment, onPartialPayment }, ref) {
  const t = useTranslations("sales.pos");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerRead[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/customers?size=8&q=${encodeURIComponent(q)}`, { cache: "no-store" });
        if (res.ok) setResults((await res.json()).items ?? []);
      } catch {
        /* silent */
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  function pick(c: CustomerRead) {
    onCustomer(c);
    setQuery("");
    setResults([]);
  }

  return (
    <div className="space-y-2 animate-in fade-in slide-in-from-top-1">
      <label className="text-[11px] text-gray-500 font-semibold uppercase tracking-widest">{t("selectCustomer")}</label>
      {customer ? (
        <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div>
            <p className="text-sm font-bold text-amber-900">{customer.name}</p>
            {customer.phone && <p className="text-xs text-amber-700">{customer.phone}</p>}
          </div>
          <button
            onClick={() => onCustomer(null)}
            className="text-amber-500 hover:text-amber-800"
            aria-label={t("dismiss")}
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
          <input
            ref={ref}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              // Enter picks the first match; Esc clears the search before leaving the step
              if (e.key === "Enter" && results[0]) {
                e.preventDefault();
                pick(results[0]);
              } else if (e.key === "Escape" && query) {
                e.preventDefault();
                setQuery("");
              }
            }}
            placeholder={t("searchCustomer")}
            className="w-full h-12 pl-9 pr-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300"
          />
          {results.length > 0 && (
            <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
              {results.map((c) => {
                const balance = parseFloat(c.balance);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => pick(c)}
                    className="w-full flex items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-amber-50 transition-colors"
                  >
                    <div>
                      <p className="font-semibold text-gray-800">{c.name}</p>
                      {c.phone && <p className="text-xs text-gray-400">{c.phone}</p>}
                    </div>
                    {balance > 0 && (
                      <span className="text-xs font-mono text-red-500 bg-red-50 px-1.5 py-0.5 rounded">
                        {formatCurrency(balance)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          {loading && <p className="text-xs text-gray-400 mt-1">{t("searching")}</p>}
          {!loading && query.trim() && results.length === 0 && (
            <p className="text-xs text-gray-400 mt-1">{t("noCustomer")}</p>
          )}
        </div>
      )}
      <PartialPaymentInput amount={partialPayment} setAmount={onPartialPayment} />
    </div>
  );
});
