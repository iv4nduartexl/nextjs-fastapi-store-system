"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createSale, SaleRead } from "@/components/actions/sales-action";
import type { ItemRead } from "@/app/openapi-client";
import { formatCurrency } from "@/lib/currency";
import {
  Search,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  X,
  Banknote,
  CreditCard,
  RefreshCcw,
  CheckCircle2,
  PackageX,
  ScanBarcode,
  Users,
  Crown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { CustomerRead } from "@/components/actions/customers-action";

interface CartItem {
  itemId: string;
  name: string;
  unitType: string;
  unitPrice: number;
  quantity: number;
}

type PaymentMethod = "cash" | "card" | "other" | "credit" | "internal";

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

function CategoryTile({
  name,
  colorIndex,
  onClick,
}: {
  name: string;
  colorIndex: number;
  onClick: () => void;
}) {
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
      {/* Category name */}
      <span className="relative text-white font-bold text-sm leading-tight drop-shadow-sm line-clamp-2">
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
}: {
  products: ItemRead[];
  onAdd: (p: ItemRead) => void;
  t: ReturnType<typeof import("next-intl").useTranslations>;
  tPos: ReturnType<typeof import("next-intl").useTranslations>;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {products.map((product) => {
        const hasPrice = product.price != null;
        const stock = parseFloat((product.stock ?? "0") as unknown as string);
        const minStock =
          product.min_stock != null
            ? parseFloat(product.min_stock as unknown as string)
            : null;
        const isLow = minStock != null && stock <= minStock;
        const isOut = stock <= 0;

        return (
          <button
            key={product.id as string}
            onClick={() => onAdd(product)}
            disabled={!hasPrice || isOut}
            className={`group relative flex flex-row items-stretch text-left rounded-xl border overflow-hidden transition-all duration-150 ${
              !hasPrice || isOut
                ? "opacity-40 cursor-not-allowed border-gray-200 bg-white"
                : "cursor-pointer border-gray-200 bg-white hover:border-green-400 hover:shadow-md hover:-translate-y-0.5 active:scale-95 active:shadow-none"
            }`}
          >
            <div className="w-16 shrink-0 bg-gray-100 flex items-center justify-center self-stretch">
              <span className="text-base font-black text-gray-500 tracking-wide uppercase">
                {t(`unitAbbr.${product.unit_type ?? "unit"}`)}
              </span>
            </div>
            <div className="flex flex-col flex-1 min-w-0 p-2.5 gap-1">
              {isOut ? (
                <span className="self-start text-[9px] px-1.5 py-0.5 bg-red-100 text-red-600 rounded-full font-semibold leading-none">
                  {tPos("outOfStock")}
                </span>
              ) : isLow ? (
                <span className="self-start text-[9px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full font-semibold leading-none">
                  ⚠ {tPos("lowStock")}
                </span>
              ) : null}
              <span className="font-semibold text-xs leading-snug text-gray-800 line-clamp-2">
                {product.name}
              </span>
              <span className="mt-auto text-green-700 font-bold text-sm tabular-nums">
                {hasPrice ? (
                  formatCurrency(product.price as unknown as string)
                ) : (
                  <span className="text-gray-400 text-xs font-normal">
                    {tPos("noPrice")}
                  </span>
                )}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export default function POSClient() {
  const t = useTranslations("sales.pos");
  const tSales = useTranslations("sales");
  const tDash = useTranslations("dashboard");

  const [products, setProducts] = useState<ItemRead[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [amountTendered, setAmountTendered] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [receipt, setReceipt] = useState<SaleRead | null>(null);

  // Category browse state
  const [categories, setCategories] = useState<string[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [categoryProducts, setCategoryProducts] = useState<ItemRead[]>([]);
  const [loadingCategoryProducts, setLoadingCategoryProducts] = useState(false);

  // Credit customer state
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerRead[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRead | null>(
    null,
  );
  const [loadingCustomers, setLoadingCustomers] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);

  const checkScroll = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setShowLeftArrow(scrollLeft > 10);
    setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 10);
  };

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const { clientWidth } = scrollRef.current;
    const scrollTo =
      direction === "left"
        ? scrollRef.current.scrollLeft - clientWidth
        : scrollRef.current.scrollLeft + clientWidth;
    scrollRef.current.scrollTo({ left: scrollTo, behavior: "smooth" });
  };

  // Autofocus search on mount + fetch categories
  useEffect(() => {
    searchRef.current?.focus();
    (async () => {
      try {
        const res = await fetch("/api/categories", { cache: "no-store" });
        if (res.ok) setCategories(await res.json());
      } catch {
        /* silent */
      } finally {
        setLoadingCategories(false);
      }
    })();
  }, []);

  // Debounced customer search
  useEffect(() => {
    if (paymentMethod !== "credit") return;
    const q = customerSearch.trim();
    if (!q) {
      setCustomerResults([]);
      return;
    }
    setLoadingCustomers(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/customers?size=8&q=${encodeURIComponent(q)}`,
          { cache: "no-store" },
        );
        if (res.ok) {
          const data = await res.json();
          setCustomerResults(data.items ?? []);
        }
      } catch {
        /* silent */
      } finally {
        setLoadingCustomers(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [customerSearch, paymentMethod]);

  // Fetch products when a category is selected
  useEffect(() => {
    if (!activeCategory) {
      setCategoryProducts([]);
      return;
    }
    setLoadingCategoryProducts(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/items?size=100&category=${encodeURIComponent(activeCategory)}`,
          { cache: "no-store" },
        );
        if (res.ok) {
          const d = await res.json();
          setCategoryProducts(d.items ?? []);
        }
      } catch {
        /* silent */
      } finally {
        setLoadingCategoryProducts(false);
      }
    })();
  }, [activeCategory]);

  // Debounced search: fetch from backend only when user has typed something
  useEffect(() => {
    const q = search.trim();
    if (!q) {
      setProducts([]);
      setLoadingProducts(false);
      return;
    }
    setLoadingProducts(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/items?size=50&q=${encodeURIComponent(q)}`,
          { cache: "no-store" },
        );
        if (res.ok) {
          const data = await res.json();
          setProducts(data.items ?? []);
        }
      } catch {
        // silent fail
      } finally {
        setLoadingProducts(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const cartTotal = cart.reduce(
    (sum, c) =>
      sum +
      (c.unitType === "gram"
        ? (c.unitPrice * c.quantity) / 1000
        : c.unitPrice * c.quantity),
    0,
  );
  const tenderedNum = parseFloat(amountTendered) || 0;
  const change = tenderedNum - cartTotal;
  const canComplete =
    cart.length > 0 &&
    (paymentMethod !== "cash" || tenderedNum >= cartTotal) &&
    (paymentMethod !== "credit" || selectedCustomer != null);

  function addToCart(product: ItemRead) {
    if (!product.price) return;
    const price = parseFloat(product.price as unknown as string);
    const step = (product.unit_type ?? "unit") === "gram" ? 100 : 1;
    setCart((prev) => {
      const existing = prev.find((c) => c.itemId === product.id);
      if (existing) {
        return prev.map((c) =>
          c.itemId === product.id ? { ...c, quantity: c.quantity + step } : c,
        );
      }
      return [
        ...prev,
        {
          itemId: product.id as string,
          name: product.name,
          unitType: product.unit_type ?? "unit",
          unitPrice: price,
          quantity: step,
        },
      ];
    });
    // Only clear search + refocus when in search mode
    if (search.trim()) {
      setSearch("");
      setTimeout(() => searchRef.current?.focus(), 0);
    }
  }

  function updateQty(itemId: string, qty: number) {
    if (qty <= 0) {
      setCart((prev) => prev.filter((c) => c.itemId !== itemId));
    } else {
      setCart((prev) =>
        prev.map((c) => (c.itemId === itemId ? { ...c, quantity: qty } : c)),
      );
    }
  }

  function removeFromCart(itemId: string) {
    setCart((prev) => prev.filter((c) => c.itemId !== itemId));
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && products.length > 0) {
      addToCart(products[0]);
    }
  }

  async function handleCompleteSale() {
    if (!canComplete) return;
    setSubmitting(true);
    setErrorMsg("");
    const result = await createSale({
      items: cart.map((c) => ({ item_id: c.itemId, quantity: c.quantity })),
      payment_method: paymentMethod,
      amount_tendered: paymentMethod === "cash" ? tenderedNum : undefined,
      customer_id:
        paymentMethod === "credit" ? selectedCustomer?.id : undefined,
    });
    setSubmitting(false);
    if (result.error) {
      setErrorMsg(typeof result.error === "string" ? result.error : "Error");
    } else if (result.data) {
      setReceipt(result.data);
      setCart([]);
      setAmountTendered("");
      setSelectedCustomer(null);
      setCustomerSearch("");
      setCustomerResults([]);
    }
  }

  function startNewSale() {
    setReceipt(null);
    setTimeout(() => searchRef.current?.focus(), 0);
  }

  // Receipt overlay
  if (receipt) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm border border-gray-100 overflow-hidden">
          {/* Header */}
          <div className="bg-green-600 px-6 py-5 text-center">
            <CheckCircle2 className="mx-auto mb-2 text-white" size={40} />
            <h2 className="text-xl font-bold text-white">
              {t("receiptTitle")}
            </h2>
          </div>

          {/* Summary */}
          <div className="px-6 py-4 space-y-3 border-b">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">{t("receiptTotal")}</span>
              <span className="text-2xl font-bold text-gray-900">
                {formatCurrency(receipt.total)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">
                {t("receiptPayment")}
              </span>
              <span className="text-sm font-semibold text-gray-700 capitalize">
                {tSales(`paymentMethod.${receipt.payment_method}`)}
              </span>
            </div>
            {receipt.change_given != null &&
              Number(receipt.change_given) > 0 && (
                <div className="flex justify-between items-center bg-green-50 rounded-lg px-3 py-2">
                  <span className="text-sm font-medium text-green-700">
                    {t("receiptChange")}
                  </span>
                  <span className="text-sm font-bold text-green-700">
                    {formatCurrency(receipt.change_given)}
                  </span>
                </div>
              )}
            {receipt.payment_method === "credit" && receipt.customer_name && (
              <div className="flex justify-between items-center bg-amber-50 rounded-lg px-3 py-2">
                <span className="text-sm font-medium text-amber-700">
                  {tSales("pos.receiptCustomer")}
                </span>
                <span className="text-sm font-bold text-amber-700">
                  {receipt.customer_name}
                </span>
              </div>
            )}
          </div>

          {/* Items */}
          <div className="px-6 py-4">
            <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-widest mb-3">
              {t("receiptItems")}
            </p>
            <div className="space-y-2">
              {receipt.sale_items.map((si) => (
                <div
                  key={si.id}
                  className="flex justify-between items-center text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                      ×{parseFloat(si.quantity).toLocaleString()}
                    </span>
                    <span className="text-gray-700">{si.item_name}</span>
                  </div>
                  <span className="font-semibold text-gray-900 font-mono">
                    {formatCurrency(si.subtotal)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Action */}
          <div className="px-6 pb-6">
            <Button
              onClick={startNewSale}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold h-11 text-sm"
            >
              {t("newSale")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-0 -m-8">
      {/* ── LEFT: Product Search + Grid ── */}
      <div className="flex flex-col flex-1 bg-gray-50 border-r overflow-hidden">
        {/* Search header */}
        <div className="px-4 pt-4 pb-3 bg-white border-b">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              size={16}
            />
            <Input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder={t("searchPlaceholder")}
              className="pl-9 h-11 rounded-lg border-gray-200 bg-gray-50 focus:bg-white text-sm"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Search result count */}
          {search.trim() && products.length > 0 && (
            <p className="text-[11px] text-gray-400 mt-2 ml-1">
              {products.length}{" "}
              {products.length === 1
                ? t("resultsHint")
                : t("resultsHintPlural")}
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
              <span className="text-xs font-semibold text-gray-700 truncate">
                {activeCategory}
              </span>
            </div>
          )}
        </div>

        {/* Content area: search results | category products | category grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* ── SEARCH MODE ── */}
          {search.trim() ? (
            loadingProducts ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-28 rounded-xl bg-gray-200 animate-pulse"
                  />
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-3">
                <PackageX size={32} className="text-gray-300" />
                <p className="text-sm">{t("noProducts")}</p>
              </div>
            ) : (
              <ProductGrid
                products={products}
                onAdd={addToCart}
                t={tDash}
                tPos={t}
              />
            )
          ) : /* ── CATEGORY PRODUCTS MODE ── */
          activeCategory ? (
            loadingCategoryProducts ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-28 rounded-xl bg-gray-200 animate-pulse"
                  />
                ))}
              </div>
            ) : categoryProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-3">
                <PackageX size={32} className="text-gray-300" />
                <p className="text-sm">{t("noCategoryProducts")}</p>
              </div>
            ) : (
              <ProductGrid
                products={categoryProducts}
                onAdd={addToCart}
                t={tDash}
                tPos={t}
              />
            )
          ) : (
            /* ── CATEGORY BROWSE MODE ── */
            <>
              {loadingCategories ? (
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-24 rounded-2xl bg-gray-200 animate-pulse"
                    />
                  ))}
                </div>
              ) : categories.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-3">
                  <ScanBarcode size={36} className="text-gray-300" />
                  <p className="text-sm text-center leading-relaxed max-w-[200px]">
                    {t("noCategories")}
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-widest mb-3">
                    {t("browseCategories")}
                  </p>
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                    {categories.map((cat, i) => (
                      <CategoryTile
                        key={cat}
                        name={cat}
                        colorIndex={i}
                        onClick={() => setActiveCategory(cat)}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── RIGHT: Cart + Payment ── */}
      <div className="w-[22rem] flex flex-col bg-white overflow-hidden">
        {/* Cart header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b bg-white">
          <div className="flex items-center gap-2">
            <ShoppingCart size={18} className="text-gray-600" />
            <h3 className="font-semibold text-gray-800">{t("cart")}</h3>
            {cart.length > 0 && (
              <span className="bg-green-100 text-green-700 text-xs font-bold px-1.5 py-0.5 rounded-full leading-none">
                {cart
                  .reduce(
                    (s, c) =>
                      s +
                      (c.unitType === "gram" ? c.quantity / 1000 : c.quantity),
                    0,
                  )
                  .toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            )}
          </div>
          {cart.length > 0 && (
            <button
              onClick={() => setCart([])}
              className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 font-medium transition-colors"
            >
              <Trash2 size={12} />
              {t("clearCart")}
            </button>
          )}
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2 text-gray-400">
              <ShoppingCart size={28} className="text-gray-200" />
              <p className="text-sm">{t("emptyCart")}</p>
            </div>
          ) : (
            cart.map((item) => (
              <div
                key={item.itemId}
                className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5"
              >
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate leading-tight">
                    {item.name}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-xs text-gray-500">
                      {item.unitType === "gram"
                        ? `${formatCurrency(item.unitPrice)}/kg`
                        : formatCurrency(item.unitPrice)}
                    </span>
                    <span className="text-[10px] font-bold text-gray-400 bg-gray-200 px-1 py-0.5 rounded leading-none">
                      {tDash(`unitAbbr.${item.unitType}`)}
                    </span>
                  </div>
                </div>

                {/* Qty controls */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() =>
                      updateQty(
                        item.itemId,
                        item.quantity - (item.unitType === "gram" ? 100 : 1),
                      )
                    }
                    className="w-6 h-6 rounded-md bg-gray-200 hover:bg-gray-300 text-gray-600 flex items-center justify-center transition-colors"
                  >
                    <Minus size={11} />
                  </button>
                  <input
                    type="number"
                    value={item.quantity}
                    min={item.unitType === "gram" ? 1 : 1}
                    step={item.unitType === "gram" ? 100 : 1}
                    onChange={(e) =>
                      updateQty(item.itemId, parseFloat(e.target.value) || 1)
                    }
                    className="w-14 text-center text-xs border border-gray-200 rounded-md py-1 font-mono bg-white"
                  />
                  <button
                    onClick={() =>
                      updateQty(
                        item.itemId,
                        item.quantity + (item.unitType === "gram" ? 100 : 1),
                      )
                    }
                    className="w-6 h-6 rounded-md bg-gray-200 hover:bg-gray-300 text-gray-600 flex items-center justify-center transition-colors"
                  >
                    <Plus size={11} />
                  </button>
                </div>

                {/* Subtotal */}
                <span className="text-sm font-semibold text-gray-800 font-mono w-16 text-right shrink-0">
                  {item.unitType === "gram"
                    ? formatCurrency((item.unitPrice * item.quantity) / 1000)
                    : formatCurrency(item.unitPrice * item.quantity)}
                </span>

                {/* Remove */}
                <button
                  onClick={() => removeFromCart(item.itemId)}
                  className="text-gray-300 hover:text-red-400 transition-colors ml-0.5 shrink-0"
                >
                  <X size={14} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* ── Payment section ── */}
        <div className="border-t bg-white">
          {/* Total */}
          <div className="flex items-center justify-between px-5 py-3 border-b bg-gray-50">
            <span className="text-sm font-medium text-gray-500">
              {t("subtotal")}
            </span>
            <span className="text-2xl font-bold text-gray-900 tabular-nums">
              {formatCurrency(cartTotal)}
            </span>
          </div>

          <div className="px-4 py-3 space-y-3">
            {/* Payment method */}
            <div>
              <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-widest mb-1.5">
                {t("paymentMethod")}
              </p>
              <div className="relative">
                <div
                  ref={scrollRef}
                  onScroll={checkScroll}
                  className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1 snap-x snap-mandatory scroll-smooth"
                >
                  {(
                    [
                      { method: "cash", Icon: Banknote },
                      { method: "credit", Icon: Users },
                      { method: "internal", Icon: Crown },
                      { method: "card", Icon: CreditCard },
                      { method: "other", Icon: RefreshCcw },
                    ] as { method: PaymentMethod; Icon: React.ElementType }[]
                  ).map(({ method: m, Icon }) => (
                    <button
                      key={m}
                      onClick={() => {
                        setPaymentMethod(m);
                        if (m !== "credit") {
                          setSelectedCustomer(null);
                          setCustomerSearch("");
                          setCustomerResults([]);
                        }
                      }}
                      className={`flex flex-col items-center justify-center gap-1 py-2 rounded-xl text-[10px] font-bold border-2 transition-all shrink-0 snap-start w-[calc((100%-18px)/4)] ${
                        paymentMethod === m
                          ? "border-green-500 bg-green-50/50 text-green-700 shadow-sm"
                          : "border-gray-100 text-gray-400 hover:border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      <Icon size={16} />
                      <span className="overflow-hidden text-ellipsis w-full px-1 text-center">
                        {tSales(`paymentMethod.${m}`)}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Left Fade/Button */}
                {showLeftArrow && (
                  <div
                    className="rounded-xl absolute left-0 top-0 bottom-1 w-8 bg-gradient-to-r from-black/40 to-transparent opacity-0 hover:opacity-100 transition-opacity flex items-center justify-start group/btn"
                  >
                    <button
                      onClick={() => scroll("left")}
                      className="h-full w-full flex items-center justify-center text-white drop-shadow-md"
                    >
                      <ChevronLeft size={20} />
                    </button>
                  </div>
                )}

                {/* Right Fade/Button */}
                {showRightArrow && (
                  <div
                    className="rounded-xl absolute right-0 top-0 bottom-1 w-8 bg-gradient-to-l from-black/40 to-transparent opacity-0 hover:opacity-100 transition-opacity flex items-center justify-end group/btn"
                  >
                    <button
                      onClick={() => scroll("right")}
                      className="h-full w-full flex items-center justify-center text-white drop-shadow-md"
                    >
                      <ChevronRight size={20} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Credit: customer picker */}
            {paymentMethod === "credit" && (
              <div className="space-y-2">
                <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-widest">
                  {tSales("pos.selectCustomer")}
                </label>
                {selectedCustomer ? (
                  <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <div>
                      <p className="text-sm font-bold text-amber-900">
                        {selectedCustomer.name}
                      </p>
                      {selectedCustomer.phone && (
                        <p className="text-xs text-amber-600">
                          {selectedCustomer.phone}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setSelectedCustomer(null);
                        setCustomerSearch("");
                      }}
                      className="text-amber-400 hover:text-amber-700"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                      size={13}
                    />
                    <input
                      type="text"
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      placeholder={tSales("pos.searchCustomer")}
                      className="w-full h-9 pl-8 pr-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300"
                    />
                    {customerResults.length > 0 && (
                      <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                        {customerResults.map((c) => {
                          const bal = parseFloat(c.balance);
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                setSelectedCustomer(c);
                                setCustomerSearch("");
                                setCustomerResults([]);
                              }}
                              className="w-full flex items-center justify-between px-3 py-2 text-left text-sm hover:bg-amber-50 transition-colors"
                            >
                              <div>
                                <p className="font-semibold text-gray-800">
                                  {c.name}
                                </p>
                                {c.phone && (
                                  <p className="text-xs text-gray-400">
                                    {c.phone}
                                  </p>
                                )}
                              </div>
                              {bal > 0 && (
                                <span className="text-xs font-mono text-red-500 bg-red-50 px-1.5 py-0.5 rounded">
                                  {formatCurrency(bal)}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {loadingCustomers && (
                      <p className="text-xs text-gray-400 mt-1">
                        {tSales("pos.searching")}
                      </p>
                    )}
                    {!loadingCustomers &&
                      customerSearch.trim() &&
                      customerResults.length === 0 && (
                        <p className="text-xs text-gray-400 mt-1">
                          {tSales("pos.noCustomer")}
                        </p>
                      )}
                  </div>
                )}
              </div>
            )}

            {/* Cash tendered + change */}
            {paymentMethod === "cash" && (
              <div className="space-y-1.5">
                <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-widest">
                  {t("amountTendered")}
                </label>
                <Input
                  type="number"
                  min={cartTotal}
                  step="1"
                  value={amountTendered}
                  onChange={(e) => setAmountTendered(e.target.value)}
                  placeholder="0"
                  className="text-base font-mono h-10 border-gray-200"
                />
                {tenderedNum > 0 && (
                  <div
                    className={`flex justify-between text-sm font-semibold rounded-lg px-3 py-2 ${
                      change >= 0
                        ? "bg-green-50 text-green-700"
                        : "bg-red-50 text-red-600"
                    }`}
                  >
                    <span>{t("change")}</span>
                    <span className="font-mono tabular-nums">
                      {formatCurrency(Math.max(0, change))}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Owner Withdrawal Warning */}
            {paymentMethod === "internal" && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg px-3 py-2.5 flex items-start gap-2 animate-in fade-in slide-in-from-top-1">
                <Crown size={16} className="text-purple-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-purple-900">
                    {tSales("pos.ownerWithdrawal")}
                  </p>
                  <p className="text-[10px] text-purple-600 leading-tight">
                    {tSales("pos.ownerWithdrawalDesc")}
                  </p>
                </div>
              </div>
            )}

            {/* Error */}
            {errorMsg && (
              <p className="text-red-500 text-xs text-center bg-red-50 rounded-lg py-2 px-3">
                {errorMsg}
              </p>
            )}

            {/* Complete sale */}
            <button
              onClick={handleCompleteSale}
              disabled={!canComplete || submitting}
              className={`w-full py-3.5 rounded-xl text-sm font-bold tracking-wide transition-all ${
                canComplete && !submitting
                  ? "bg-green-600 hover:bg-green-700 text-white shadow-md shadow-green-200 active:scale-[0.98]"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}
            >
              {submitting ? t("processing") : t("completeSale")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
