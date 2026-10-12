"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, ClipboardList, Loader2, PackageSearch, ScanBarcode, Search, X } from "lucide-react";

import {
  applyInventoryCount,
  type InventoryCountRead,
  type InventoryCountSummary,
} from "@/components/actions/inventory-action";
import { CountReview } from "@/components/inventory/count-review";
import { CountHeader, CountRow } from "@/components/inventory/count-row";
import { useMe } from "@/components/me-provider";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/routing";
import {
  countReducer,
  countSummary,
  emptyCount,
  filterProducts,
  inScope,
  isScanCountable,
  toCountPayload,
  type CountAction,
  type CountDraft,
  type CountFilter,
} from "@/lib/inventory/count";
import { findBySku, searchCatalog, type PosProduct } from "@/lib/pos/catalog-search";
import LocalDateSpan from "@/lib/LocalDateSpan";
import { useBarcodeScanner } from "@/lib/pos/use-barcode-scanner";
import { useCatalog } from "@/lib/pos/use-catalog";
import { clearDraft, readDraft, useAutosave } from "@/lib/use-local-draft";

type Phase = "start" | "count" | "review" | "done";
const PAGE = 150;

type ReducerAction = CountAction | { type: "replace"; draft: CountDraft };

function reducer(state: CountDraft, action: ReducerAction): CountDraft {
  return action.type === "replace" ? action.draft : countReducer(state, action);
}

/** Owner flow: pick what to count → count (scan or type) → review → apply. */
export function InventoryCount({ history, locale }: { history: InventoryCountSummary[]; locale: string }) {
  const t = useTranslations("inventory");
  const me = useMe();
  const draftKey = `inventory-count:${me?.business_id ?? "default"}`;
  const catalog = useCatalog();

  const [phase, setPhase] = useState<Phase>("start");
  const [draft, dispatch] = useReducer(reducer, null, () => emptyCount(null));
  const [saved, setSaved] = useState<CountDraft | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<CountFilter>("pending");
  const [limit, setLimit] = useState(PAGE);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [zeroUncounted, setZeroUncounted] = useState(false);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InventoryCountRead | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef(new Map<string, HTMLInputElement>());

  useEffect(() => {
    const stored = readDraft<CountDraft>(draftKey);
    if (stored?.version === 1 && Object.keys(stored.entries).length > 0) setSaved(stored);
  }, [draftKey]);
  useAutosave(draftKey, draft, phase === "count" || phase === "review");

  const products = catalog.products;
  const scope = useMemo(() => inScope(products, draft.category), [products, draft.category]);
  const summary = useMemo(() => countSummary(products, draft), [products, draft]);
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of products) if (p.category) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [products]);

  const visible = useMemo(() => {
    // Searching looks in the whole catalog: a product found on the shelf can always be counted
    if (search.trim()) return searchCatalog(products, search, 40);
    return filterProducts(scope, draft, filter);
  }, [search, products, scope, draft, filter]);

  function start(category: string | null) {
    dispatch({ type: "replace", draft: emptyCount(category) });
    setFilter("pending");
    setSearch("");
    setPhase("count");
    setTimeout(() => searchRef.current?.focus(), 0);
  }

  function resume(stored: CountDraft) {
    dispatch({ type: "replace", draft: stored });
    setSaved(null);
    setPhase("count");
    setTimeout(() => searchRef.current?.focus(), 0);
  }

  function focusRow(product: PosProduct) {
    setHighlightId(product.id);
    setTimeout(() => {
      const input = rowRefs.current.get(product.id);
      input?.focus();
      input?.select();
      input?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 0);
  }

  function backToSearch() {
    setSearch("");
    setTimeout(() => searchRef.current?.focus(), 0);
  }

  /** Scanner or Enter in the search box. Unit products: +1 per scan; others: type the amount. */
  function pick(code: string, fromScanner: boolean) {
    const bySku = findBySku(products, code);
    const product = bySku ?? (fromScanner ? undefined : visible[0]);
    if (!product) {
      setNotice(code);
      return;
    }
    setNotice(null);
    if (bySku && isScanCountable(bySku)) {
      dispatch({ type: "scan", product: bySku });
      setHighlightId(bySku.id);
      setSearch("");
      setTimeout(() => searchRef.current?.focus(), 0);
      return;
    }
    if (!search.trim() || bySku) setSearch(product.name);
    focusRow(product);
  }

  useBarcodeScanner((code) => pick(code, true), phase === "count");

  async function apply() {
    setSubmitting(true);
    setError(null);
    const response = await applyInventoryCount(toCountPayload(draft, zeroUncounted, notes));
    setSubmitting(false);
    if (response.data) {
      clearDraft(draftKey);
      setResult(response.data);
      setPhase("done");
      catalog.refresh();
    } else {
      setError(t("review.errors.generic"));
    }
  }

  if (catalog.loading) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (phase === "done" && result) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 rounded-2xl border bg-white px-6 py-12 text-center">
        <CheckCircle2 className="h-12 w-12 text-green-500" />
        <h1 className="text-xl font-bold text-gray-900">{t("done.title")}</h1>
        <p className="text-sm text-gray-600">
          {t("done.summary", { counted: result.lines_counted, changed: result.lines_changed })}
        </p>
        <div className="flex gap-3">
          <Link href={`/products/inventory/${result.id}`}>
            <Button variant="outline">{t("done.seeDetail")}</Button>
          </Link>
          <Button
            onClick={() => {
              setResult(null);
              setNotes("");
              setZeroUncounted(false);
              setPhase("start");
            }}
            className="bg-green-600 hover:bg-green-700"
          >
            {t("done.newCount")}
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "review") {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <CountReview
          draft={draft}
          products={products}
          summary={summary}
          zeroUncounted={zeroUncounted}
          onZeroUncounted={setZeroUncounted}
          notes={notes}
          onNotes={setNotes}
          submitting={submitting}
          error={error}
          onBack={() => setPhase("count")}
          onApply={apply}
          onSet={(product, counted) => dispatch({ type: "set", product, counted })}
        />
      </div>
    );
  }

  if (phase === "start") {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-gray-900">{t("start.title")}</h1>
          <p className="text-sm text-gray-500">{t("start.subtitle")}</p>
        </header>

        {saved && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <ClipboardList className="h-5 w-5 text-amber-700" />
            <p className="flex-1 text-sm text-amber-900">
              {t("start.resume", {
                count: Object.keys(saved.entries).length,
                scope: saved.category ?? t("start.everything"),
              })}
            </p>
            <Button onClick={() => resume(saved)} className="bg-amber-600 hover:bg-amber-700">
              {t("start.resumeButton")}
            </Button>
            <button
              type="button"
              onClick={() => {
                clearDraft(draftKey);
                setSaved(null);
              }}
              className="text-sm text-amber-800 underline"
            >
              {t("start.discard")}
            </button>
          </div>
        )}

        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-700">{t("start.question")}</p>
          <button
            type="button"
            onClick={() => start(null)}
            className="flex w-full items-center gap-3 rounded-2xl border-2 border-gray-200 bg-white p-4 text-left hover:border-gray-900"
          >
            <PackageSearch className="h-6 w-6 text-gray-700" />
            <span className="flex-1">
              <span className="block font-semibold text-gray-900">{t("start.everything")}</span>
              <span className="block text-xs text-gray-500">{t("start.products", { count: products.length })}</span>
            </span>
          </button>
          {categories.length > 0 && (
            <>
              <p className="pt-2 text-xs font-semibold uppercase tracking-widest text-gray-400">{t("start.orCategory")}</p>
              <div className="flex flex-wrap gap-2">
                {categories.map(([category, count]) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => start(category)}
                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium hover:border-gray-900"
                  >
                    {category} <span className="text-gray-400">· {count}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <section className="space-y-2 pt-4">
          <h2 className="text-sm font-semibold text-gray-700">{t("history.title")}</h2>
          {history.length === 0 ? (
            <p className="text-sm text-gray-500">{t("history.none")}</p>
          ) : (
            <ul className="divide-y overflow-hidden rounded-2xl border bg-white text-sm">
              {history.map((count) => (
                <li key={count.id}>
                  <Link href={`/products/inventory/${count.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                    <span className="flex-1">
                      <span className="font-medium text-gray-900">{count.category ?? t("start.everything")}</span>
                      <span className="block text-xs text-gray-500">
                        <LocalDateSpan
                          dateIso={count.applied_at}
                          locale={locale}
                          options={{ day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }}
                        />
                        {count.user_name && <> · {count.user_name}</>}
                      </span>
                    </span>
                    <span className="text-xs text-gray-500">
                      {t("history.changes", { changed: count.lines_changed, counted: count.lines_counted })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  }

  // ── Counting ──
  const percent = summary.total > 0 ? Math.round((Math.min(summary.counted, summary.total) / summary.total) * 100) : 0;
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 pb-24">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{draft.category ?? t("start.everything")}</h1>
          <p className="text-sm text-gray-500">{t("count.progress", { counted: summary.counted, total: summary.total })}</p>
        </div>
        <button type="button" onClick={() => setPhase("start")} className="text-sm text-gray-500 hover:text-gray-800">
          {t("count.changeScope")}
        </button>
      </header>
      <div className="h-2 overflow-hidden rounded-full bg-gray-100" aria-hidden>
        <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${percent}%` }} />
      </div>

      <div className="sticky top-0 z-10 space-y-2 bg-gray-50/95 py-2 backdrop-blur">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setNotice(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && search.trim()) {
                e.preventDefault();
                pick(search.trim(), false);
              } else if (e.key === "Escape") {
                setSearch("");
              }
            }}
            placeholder={t("count.searchPlaceholder")}
            className="h-12 w-full rounded-xl border border-gray-200 bg-white pl-9 pr-9 text-base outline-none focus:ring-2 focus:ring-gray-900/10"
          />
          {search && (
            <button type="button" onClick={backToSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {notice ? (
          <p role="alert" className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800">
            {t("count.notFound", { code: notice })}
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-[11px] text-gray-400">
            <ScanBarcode className="h-3.5 w-3.5" /> {t("count.hint")}
          </p>
        )}
        {!search.trim() && (
          <div className="flex gap-2">
            {(["pending", "counted", "differences"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => {
                  setFilter(f);
                  setLimit(PAGE);
                }}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  filter === f ? "bg-gray-900 text-white" : "bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-100"
                }`}
              >
                {t(`count.filter.${f}`)}
              </button>
            ))}
          </div>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-2xl border bg-white px-4 py-10 text-center text-sm text-gray-500">
          {search.trim() ? t("count.noResults") : t(`count.empty.${filter}`)}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-white">
          <CountHeader />
          <ul className="divide-y">
            {visible.slice(0, limit).map((product) => (
              <CountRow
                key={product.id}
                ref={(el) => {
                  if (el) rowRefs.current.set(product.id, el);
                  else rowRefs.current.delete(product.id);
                }}
                product={product}
                entry={draft.entries[product.id]}
                highlighted={highlightId === product.id}
                onSet={(counted) => dispatch({ type: "set", product, counted })}
                  onDone={backToSearch}
              />
            ))}
          </ul>
        </div>
      )}
      {visible.length > limit && (
        <div className="text-center">
          <Button variant="outline" onClick={() => setLimit((l) => l + PAGE)}>
            {t("count.showMore", { count: visible.length - limit })}
          </Button>
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <p className="text-sm text-gray-600">
            {t("count.footer", { counted: summary.counted, differences: summary.withDifferences })}
          </p>
          <Button
            onClick={() => setPhase("review")}
            disabled={summary.counted === 0}
            className="h-11 bg-green-600 px-5 hover:bg-green-700"
          >
            {t("count.review")}
          </Button>
        </div>
      </div>
    </div>
  );
}
