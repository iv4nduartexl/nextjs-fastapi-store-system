"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Building2, Check, Plus, Search } from "lucide-react";

import { searchSuppliers, type RecentSupplier } from "@/components/actions/purchasing-action";
import { NumberField } from "@/components/purchases/wizard/number-field";
import { Input } from "@/components/ui/input";
import { currencySymbol } from "@/lib/currency";
import { toDateInputValue } from "@/lib/dates";
import LocalDateSpan from "@/lib/LocalDateSpan";
import type { DraftAction, PurchaseDraft } from "@/lib/purchases/draft";

interface StepSupplierProps {
  draft: PurchaseDraft;
  dispatch: (action: DraftAction) => void;
  recent: RecentSupplier[];
  locale: string;
}

export function StepSupplier({ draft, dispatch, recent, locale }: StepSupplierProps) {
  const t = useTranslations("purchases.wizard.supplier");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; name: string }[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const chosen = draft.supplier != null || draft.noSupplier;

  useEffect(() => {
    if (!chosen) searchRef.current?.focus();
  }, [chosen]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const result = await searchSuppliers(q);
      setResults(result.data ?? []);
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  function choose(supplier: { id?: string; name: string }) {
    dispatch({ type: "setSupplier", supplier });
    setQuery("");
  }

  const exactMatch = results.some((r) => r.name.toLowerCase() === query.trim().toLowerCase());
  const yesterday = toDateInputValue(new Date(Date.now() - 86400000));
  const today = toDateInputValue();

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
        <p className="text-sm text-gray-500">{t("subtitle")}</p>
      </header>

      {chosen ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl border-2 border-gray-900 bg-white px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-900 text-white">
              <Check className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{t("chosen")}</p>
              <p className="text-lg font-semibold text-gray-900">
                {draft.noSupplier ? t("noSupplier") : draft.supplier?.name}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              dispatch({ type: "setSupplier", supplier: null });
            }}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            {t("change")}
          </button>
        </div>
      ) : (
        <section className="space-y-4">
          {recent.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{t("recent")}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {recent.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => choose({ id: s.id, name: s.name ?? "" })}
                    className="flex min-h-[64px] items-start gap-2.5 rounded-xl border border-gray-200 bg-white p-3 text-left transition hover:border-gray-900 hover:shadow-sm"
                  >
                    <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-gray-900">{s.name}</span>
                      <span className="block text-xs text-gray-500">
                        {t("lastPurchase")}{" "}
                        <LocalDateSpan dateIso={s.last_purchase_at} locale={locale} options={{ day: "numeric", month: "short" }} />
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && query.trim()) {
                  e.preventDefault();
                  const match = results.find((r) => r.name.toLowerCase() === query.trim().toLowerCase());
                  choose(match ?? results[0] ?? { name: query.trim() });
                }
              }}
              placeholder={t("searchPlaceholder")}
              className="h-12 pl-9 text-base"
            />
          </div>
          {query.trim() && (
            <div className="overflow-hidden rounded-xl border bg-white">
              {results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => choose(r)}
                  className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-gray-50"
                >
                  <Building2 className="h-4 w-4 text-gray-400" />
                  {r.name}
                </button>
              ))}
              {!exactMatch && (
                <button
                  type="button"
                  onClick={() => choose({ name: query.trim() })}
                  className="flex w-full items-center gap-2 border-t bg-emerald-50/50 px-4 py-3 text-left font-medium text-emerald-800 hover:bg-emerald-50"
                >
                  <Plus className="h-4 w-4" />
                  {t("createNew", { name: query.trim() })}
                </button>
              )}
            </div>
          )}

          <p className="text-xs text-gray-500">{t("noSupplierHint")}</p>
        </section>
      )}

      {chosen && (
        <section className="space-y-5">
          <div className="space-y-1.5">
            <label htmlFor="purchase-date" className="text-sm font-medium text-gray-700">
              {t("date")}
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {[
                { value: today, label: t("today") },
                { value: yesterday, label: t("yesterday") },
              ].map((chip) => (
                <button
                  key={chip.value}
                  type="button"
                  onClick={() => dispatch({ type: "setHeader", patch: { date: chip.value } })}
                  className={`h-10 rounded-lg border px-3 text-sm font-medium ${
                    draft.date === chip.value ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white hover:bg-gray-50"
                  }`}
                >
                  {chip.label}
                </button>
              ))}
              <input
                id="purchase-date"
                type="date"
                value={draft.date}
                max={today}
                onChange={(e) => dispatch({ type: "setHeader", patch: { date: e.target.value } })}
                className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm"
              />
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="invoice-number" className="text-sm font-medium text-gray-700">
                {t("invoiceNumber")} <span className="font-normal text-gray-400">({t("optional")})</span>
              </label>
              <Input
                id="invoice-number"
                value={draft.invoiceNumber}
                onChange={(e) => dispatch({ type: "setHeader", patch: { invoiceNumber: e.target.value } })}
                className="h-11 font-mono"
              />
              <p className="text-xs text-gray-500">{t("invoiceNumberHint")}</p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="invoice-total" className="text-sm font-medium text-gray-700">
                {t("invoiceTotal")} <span className="font-normal text-gray-400">({t("recommended")})</span>
              </label>
              <NumberField
                id="invoice-total"
                prefix={currencySymbol}
                value={draft.invoiceTotal}
                onValueChange={(v) => dispatch({ type: "setHeader", patch: { invoiceTotal: v } })}
              />
              <p className="text-xs text-gray-500">{t("invoiceTotalHint")}</p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
