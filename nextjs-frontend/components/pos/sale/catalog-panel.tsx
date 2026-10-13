"use client";

import { forwardRef, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { PackageX, Plus, ScanBarcode, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/currency";
import { formatNumber } from "@/lib/format-number";
import { parseMultiplier, searchCatalog, type PosProduct } from "@/lib/pos/catalog-search";

type Translator = ReturnType<typeof useTranslations>;

// ── Deterministic color palette for category tiles ──────────────────────────
const CAT_GRADIENTS = [
  "from-emerald-400 to-emerald-600",
  "from-blue-400 to-blue-600",
  "from-violet-400 to-violet-600",
  "from-rose-400 to-rose-600",
  "from-amber-400 to-amber-500",
  "from-teal-400 to-teal-600",
  "from-indigo-400 to-indigo-600",
  "from-orange-400 to-orange-600",
  "from-cyan-400 to-cyan-600",
  "from-pink-400 to-pink-600",
  "from-lime-500 to-lime-600",
  "from-fuchsia-400 to-fuchsia-600",
] as const;

function CategoryTile({ name, colorIndex, onClick }: { name: string; colorIndex: number; onClick: () => void }) {
  const gradient = CAT_GRADIENTS[colorIndex % CAT_GRADIENTS.length];
  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col justify-end overflow-hidden h-24 rounded-2xl bg-gradient-to-br ${gradient} shadow-sm hover:shadow-xl hover:-translate-y-0.5 active:scale-[0.97] transition-all duration-150 p-3.5 text-left`}
    >
      {/* Watermark letter */}
      <span
        aria-hidden
        className="absolute -top-2 -right-1 text-[72px] font-black text-white/15 leading-none select-none pointer-events-none"
      >
        {name[0].toUpperCase()}
      </span>
      <span title={name} className="relative text-white font-bold text-sm leading-tight drop-shadow-sm line-clamp-2">
        {name}
      </span>
    </button>
  );
}

function ProductGrid({
  products,
  onAdd,
  t,
  tPos,
  highlightedIndex = -1,
}: {
  products: PosProduct[];
  onAdd: (p: PosProduct) => void;
  t: Translator;
  tPos: Translator;
  /** Result selected with the arrow keys (Enter adds it) */
  highlightedIndex?: number;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {products.map((product, index) => {
        const hasPrice = product.price != null;
        const stock = parseFloat((product.stock ?? "0") as unknown as string);
        const minStock = product.min_stock != null ? parseFloat(product.min_stock as unknown as string) : null;
        const isLow = minStock != null && stock <= minStock;
        const isOut = stock <= 0;

        return (
          <button
            key={product.id}
            onClick={() => onAdd(product)}
            // Out of stock only warns: stock counts can be wrong and the sale must not be blocked
            disabled={!hasPrice}
            data-highlighted={index === highlightedIndex || undefined}
            className={`group relative flex flex-row items-stretch text-left rounded-xl border overflow-hidden transition-all duration-150 ${
              !hasPrice
                ? "opacity-40 cursor-not-allowed border-gray-200 bg-white"
                : index === highlightedIndex
                  ? "cursor-pointer border-green-500 bg-green-50 ring-2 ring-green-400 shadow-md"
                  : "cursor-pointer border-gray-200 bg-white hover:border-green-400 hover:shadow-md hover:-translate-y-0.5 active:scale-95 active:shadow-none"
            }`}
          >
            <div className="w-16 shrink-0 bg-gray-100 flex items-center justify-center self-stretch">
              <span className="text-base font-black text-gray-500 tracking-wide uppercase">
                {t(`unitAbbr.${product.unit_type ?? "unit"}`)}
              </span>
            </div>
            <div className="flex flex-col flex-1 min-w-0 p-2.5 gap-1">
              <span title={product.name} className="font-semibold text-xs leading-snug text-gray-800 line-clamp-2">
                {isLow && !isOut && (
                  <span
                    className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-400 align-middle"
                    title={tPos("lowStock")}
                    aria-label={tPos("lowStock")}
                  />
                )}
                {product.name}
              </span>
              {/* Only a hint: out-of-stock products can still be sold (stock stays at 0) */}
              {isOut && <span className="text-[10px] leading-none text-gray-400">{tPos("noStockHint")}</span>}
              <span className="mt-auto text-green-700 font-bold text-sm tabular-nums">
                {hasPrice ? (
                  formatCurrency(product.price)
                ) : (
                  <span className="text-gray-400 text-xs font-normal">{tPos("noPrice")}</span>
                )}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function SkeletonGrid({ count, className }: { count: number; className: string }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`${className} bg-gray-200 animate-pulse`} />
      ))}
    </div>
  );
}

/**
 * Step 1, left side: search / scan, categories and the product grid.
 * Owns the search text; adding, unknown codes and "charge" go back to the sale flow.
 */
export const CatalogPanel = forwardRef<
  HTMLInputElement,
  {
    products: PosProduct[];
    loading: boolean;
    categories: string[];
    /** `quantity`: count for unit products; null opens the weight panel for weighed ones */
    onAdd: (product: PosProduct, quantity: number | null) => void;
    /** Exact barcode / SKU match; false when the code is unknown */
    addByCode: (code: string, quantity: number | null) => boolean;
    onQuickCreate: (text: string, quantity: number | null) => void;
    /** Enter on an empty search */
    onCheckout: () => void;
    scanNotice: string | null;
    setScanNotice: (code: string | null) => void;
  }
>(function CatalogPanel(
  { products: catalog, loading, categories, onAdd, addByCode, onQuickCreate, onCheckout, scanNotice, setScanNotice },
  searchRef,
) {
  const t = useTranslations("sales.pos");
  const tDash = useTranslations("dashboard");
  const [search, setSearch] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const multiplier = parseMultiplier(search);
  const results = useMemo(() => searchCatalog(catalog, multiplier.term), [catalog, multiplier.term]);
  const categoryProducts = useMemo(
    () => (activeCategory ? catalog.filter((p) => p.category === activeCategory) : []),
    [catalog, activeCategory],
  );

  // Arrow-key selection starts at the best match whenever the results change
  useEffect(() => {
    setHighlighted(0);
  }, [multiplier.term]);
  useEffect(() => {
    document.querySelector('[data-highlighted="true"]')?.scrollIntoView({ block: "nearest" });
  }, [highlighted]);

  function add(product: PosProduct, quantity: number | null) {
    onAdd(product, product.unit_type === "gram" ? null : quantity);
    // Ready for the next product
    setSearch("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (results.length === 0) return;
      e.preventDefault();
      setHighlighted((i) => (e.key === "ArrowDown" ? Math.min(i + 1, results.length - 1) : Math.max(i - 1, 0)));
      return;
    }
    if (e.key === "Escape") {
      setSearch("");
      setScanNotice(null);
      return;
    }
    if (e.key !== "Enter") return;

    const term = multiplier.term.trim();
    e.preventDefault();
    if (!term) {
      onCheckout();
      return;
    }
    // Barcode (scanned into the field) or exact SKU first, then the highlighted result
    if (addByCode(term, multiplier.quantity)) {
      setSearch("");
      return;
    }
    const product = results[highlighted] ?? results[0];
    if (product) add(product, multiplier.quantity);
    else setScanNotice(term);
  }

  return (
    <div className="flex flex-col flex-1 min-w-0 bg-gray-50 overflow-hidden">
      {/* Search header */}
      <div className="px-4 pt-4 pb-3 bg-white border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <Input
            ref={searchRef}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setScanNotice(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder={t("searchPlaceholder")}
            aria-keyshortcuts="F1"
            className="pl-9 pr-16 h-11 rounded-lg border-gray-200 bg-gray-50 focus:bg-white text-sm"
          />
          {multiplier.quantity != null && (
            <span className="absolute right-9 top-1/2 -translate-y-1/2 rounded-md bg-gray-900 px-1.5 py-0.5 text-xs font-bold text-white tabular-nums">
              ×{formatNumber(multiplier.quantity, 3)}
            </span>
          )}
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {scanNotice && (
          <p
            role="alert"
            className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800"
          >
            <PackageX size={14} />
            <span className="flex-1">{t("codeNotFound", { code: scanNotice })}</span>
            <button
              type="button"
              onClick={() => onQuickCreate(scanNotice, multiplier.quantity)}
              className="shrink-0 rounded-md bg-amber-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-amber-700"
            >
              {t("quickCreate.createWithCode")}
            </button>
          </p>
        )}
        {!search.trim() && !scanNotice && (
          <p className="mt-2 ml-1 hidden text-[11px] text-gray-400 md:block">{t("shortcutsHint")}</p>
        )}

        {search.trim() && results.length > 0 && (
          <p className="text-[11px] text-gray-400 mt-2 ml-1">
            {results.length} {results.length === 1 ? t("resultsHint") : t("resultsHintPlural")}
          </p>
        )}

        {/* Category breadcrumb */}
        {!search.trim() && activeCategory && (
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => setActiveCategory(null)}
              className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800 transition-colors"
            >
              <X size={12} />
              {t("allCategories")}
            </button>
            <span className="text-gray-300">/</span>
            <span title={activeCategory} className="text-xs font-semibold text-gray-700 truncate">
              {activeCategory}
            </span>
          </div>
        )}
      </div>

      {/* Content area: search results | category products | category grid */}
      <div className="flex-1 overflow-y-auto p-4 pb-24 md:pb-4">
        {search.trim() ? (
          loading ? (
            <SkeletonGrid count={8} className="h-28 rounded-xl" />
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-3">
              <PackageX size={32} className="text-gray-300" />
              <p className="text-sm">{t("noProducts")}</p>
              {multiplier.term.trim() && (
                <Button
                  type="button"
                  onClick={() => onQuickCreate(multiplier.term.trim(), multiplier.quantity)}
                  className="gap-1.5 bg-green-600 hover:bg-green-700"
                >
                  <Plus size={15} /> {t("quickCreate.createNamed", { name: multiplier.term.trim() })}
                </Button>
              )}
            </div>
          ) : (
            <ProductGrid
              products={results}
              onAdd={(p) => add(p, multiplier.quantity)}
              t={tDash}
              tPos={t}
              highlightedIndex={highlighted}
            />
          )
        ) : activeCategory ? (
          loading ? (
            <SkeletonGrid count={6} className="h-28 rounded-xl" />
          ) : categoryProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-3">
              <PackageX size={32} className="text-gray-300" />
              <p className="text-sm">{t("noCategoryProducts")}</p>
            </div>
          ) : (
            <ProductGrid products={categoryProducts} onAdd={(p) => add(p, null)} t={tDash} tPos={t} />
          )
        ) : loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-24 rounded-2xl bg-gray-200 animate-pulse" />
            ))}
          </div>
        ) : categories.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-3">
            <ScanBarcode size={36} className="text-gray-300" />
            <p className="text-sm text-center leading-relaxed max-w-[200px]">{t("noCategories")}</p>
          </div>
        ) : (
          <>
            <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-widest mb-3">
              {t("browseCategories")}
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {categories.map((cat, i) => (
                <CategoryTile key={cat} name={cat} colorIndex={i} onClick={() => setActiveCategory(cat)} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
});
