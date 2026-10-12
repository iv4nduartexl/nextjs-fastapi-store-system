"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowLeft, ArrowUp, ChevronLeft, ChevronRight, Loader2, Search, X } from "lucide-react";

import { CountHeader, CountRow } from "@/components/inventory/count-row";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/currency";
import { difference, type CountDraft, type CountSummary } from "@/lib/inventory/count";
import { normalize, type PosProduct } from "@/lib/pos/catalog-search";

const PAGE_SIZE = 25;

interface CountReviewProps {
  draft: CountDraft;
  products: PosProduct[];
  summary: CountSummary;
  zeroUncounted: boolean;
  onZeroUncounted: (value: boolean) => void;
  notes: string;
  onNotes: (value: string) => void;
  submitting: boolean;
  error: string | null;
  onBack: () => void;
  onApply: () => void;
  /** Edit (or with null, discard) a counted product right here */
  onSet: (product: PosProduct, counted: number | null) => void;
}

/** Last look before changing stock: only what changes, and what it's worth. */
export function CountReview(props: CountReviewProps) {
  const { draft, products, summary, zeroUncounted, onZeroUncounted, notes, onNotes, submitting, error, onBack, onApply } =
    props;
  const t = useTranslations("inventory.review");
  const [show, setShow] = useState<"differences" | "all">(summary.withDifferences > 0 ? "differences" : "all");
  // Order is fixed when the review opens, so rows don't jump around while editing
  const [order] = useState(() =>
    Object.entries(draft.entries)
      .sort(([, a], [, b]) => Math.abs(difference(b)) - Math.abs(difference(a)))
      .map(([id]) => id),
  );
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const byId = new Map(products.map((p) => [p.id, p]));
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const rows = order
    .map((id) => byId.get(id))
    .filter((p): p is PosProduct => !!p)
    .filter((p) => {
      const entry = draft.entries[p.id];
      return show === "all" ? true : !entry || difference(entry) !== 0;
    })
    .filter((p) => {
      if (words.length === 0) return true;
      const haystack = normalize(`${p.name} ${p.sku ?? ""} ${p.category ?? ""}`);
      return words.every((w) => haystack.includes(w));
    });
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = rows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  return (
    <div className="space-y-6 pb-24">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft className="h-4 w-4" /> {t("backToCount")}
      </button>
      <header>
        <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
        <p className="text-sm text-gray-500">{t("subtitle", { counted: summary.counted })}</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">{t("changes")}</p>
          <p className="text-2xl font-black tabular-nums text-gray-900">{summary.withDifferences}</p>
          <p className="text-xs text-gray-500">
            <ArrowUp className="inline h-3 w-3 text-green-600" /> {summary.up} · <ArrowDown className="inline h-3 w-3 text-red-600" />{" "}
            {summary.down}
          </p>
        </div>
        <div className={`rounded-2xl border p-4 sm:col-span-2 ${summary.valueChange < 0 ? "border-red-100 bg-red-50" : "bg-white"}`}>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">{t("value")}</p>
          <p className={`text-2xl font-black tabular-nums ${summary.valueChange < 0 ? "text-red-700" : "text-gray-900"}`}>
            {summary.valueChange > 0 ? "+" : ""}
            {formatCurrency(summary.valueChange)}
          </p>
          <p className="text-xs text-gray-500">
            {summary.valueChange < 0 ? t("missingGoods") : summary.valueChange > 0 ? t("extraGoods") : t("noValueChange")}
          </p>
        </div>
      </div>

      {summary.uncountedWithStock > 0 && (
        <label className="flex items-start gap-2 rounded-xl border bg-white p-3 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={zeroUncounted}
            onChange={(e) => onZeroUncounted(e.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span>
            {t("zeroUncounted", { count: summary.uncountedWithStock })}
            <span className="block text-xs text-gray-500">{t("zeroUncountedHint")}</span>
          </span>
        </label>
      )}

      <div className="space-y-1.5">
        <label htmlFor="count-notes" className="text-sm font-medium text-gray-700">
          {t("notes")} <span className="font-normal text-gray-400">({t("optional")})</span>
        </label>
        <textarea
          id="count-notes"
          rows={2}
          value={notes}
          onChange={(e) => onNotes(e.target.value)}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900/10"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["differences", "all"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setShow(value);
              setPage(0);
            }}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              show === value ? "bg-gray-900 text-white" : "bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-100"
            }`}
          >
            {t(`show.${value}`, { count: value === "all" ? summary.counted : summary.withDifferences })}
          </button>
        ))}
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-8 text-sm outline-none focus:ring-2 focus:ring-gray-900/10"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label={t("clearSearch")}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border bg-white px-4 py-6 text-center text-sm text-gray-500">
          {query.trim() ? t("noMatches") : show === "differences" ? t("noChanges") : t("nothingCounted")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-white">
          <CountHeader removable />
          <ul className="divide-y text-sm">
            {pageRows.map((product) =>
              draft.entries[product.id] ? (
                <CountRow
                  key={product.id}
                  product={product}
                  entry={draft.entries[product.id]}
                  onSet={(counted) => props.onSet(product, counted)}
                  onRemove={() => props.onSet(product, null)}
                />
              ) : (
                <li key={product.id} className="flex items-center justify-between px-4 py-2.5 text-gray-400">
                  <span className="truncate line-through">{product.name}</span>
                  <button
                    type="button"
                    onClick={() => props.onSet(product, parseFloat(product.stock) || 0)}
                    className="text-xs font-medium text-gray-600 underline"
                  >
                    {t("undoDiscard")}
                  </button>
                </li>
              ),
            )}
          </ul>
          {pageCount > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-2 text-sm text-gray-600">
              <span className="tabular-nums">
                {t("pageRange", {
                  from: currentPage * PAGE_SIZE + 1,
                  to: Math.min(rows.length, (currentPage + 1) * PAGE_SIZE),
                  total: rows.length,
                })}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(currentPage - 1)}
                  disabled={currentPage === 0}
                  aria-label={t("previousPage")}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-2 tabular-nums">
                  {currentPage + 1} / {pageCount}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(currentPage + 1)}
                  disabled={currentPage >= pageCount - 1}
                  aria-label={t("nextPage")}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Always reachable, however long the list is */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          {error ? (
            <p className="min-w-0 flex-1 text-sm text-red-600">{error}</p>
          ) : (
            <p className="min-w-0 flex-1 text-sm text-gray-600">
              {t("footer", { counted: summary.counted, changes: summary.withDifferences })}
            </p>
          )}
          <Button
            onClick={onApply}
            disabled={submitting || summary.counted === 0}
            className="h-11 gap-2 bg-green-600 px-5 hover:bg-green-700"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("apply")}
          </Button>
        </div>
      </div>
    </div>
  );
}
