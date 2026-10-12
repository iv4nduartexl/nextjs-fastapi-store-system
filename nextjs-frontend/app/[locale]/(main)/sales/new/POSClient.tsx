"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createSale, SaleRead } from "@/components/actions/sales-action";
import { formatCurrency } from "@/lib/currency";
import { formatNumber } from "@/lib/format-number";
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
  PackageX,
  ScanBarcode,
  Users,
  Crown,
  DollarSign,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { type CustomerRead } from "@/components/actions/customers-action";
import autoAnimate from "@formkit/auto-animate";
import ProductQuantityModal from "@/components/Modals/product-quantity-modal";
import { QuickCreateProduct } from "@/components/pos/quick-create-product";
import { PartialPaymentInput } from "@/components/Pages/sales/new/PosClient/partial-payment-input";
import {
  findBySku,
  parseMultiplier,
  searchCatalog,
  type PosProduct,
} from "@/lib/pos/catalog-search";
import { useCatalog } from "@/lib/pos/use-catalog";
import { suggestCashAmounts } from "@/lib/pos/cash";
import { SaleDoneBanner } from "@/components/pos/sale-done-banner";
import { StepBar } from "@/components/pos/step-bar";
import { isTypingField, useBarcodeScanner } from "@/lib/pos/use-barcode-scanner";

interface CartItem {
  itemId: string;
  name: string;
  unitType: string;
  category: string | null;
  unitPrice: number;
  quantity: number;
  manualOverridePrice?: number;
  manualOverrideReason?: string;
}

interface QuantityDiscountRule {
  id: string;
  name: string;
  scope: "global" | "item" | "category";
  item_id: string | null;
  category: string | null;
  min_qty: string;
  rule_type: "percent" | "fixed_price" | "buy_x_get_y";
  percent_off: string | null;
  fixed_unit_price: string | null;
  buy_qty: string | null;
  free_qty: string | null;
}

type PaymentMethod = "cash" | "card" | "other" | "credit" | "internal";
type PriceOverrideMode = "unit" | "line_total";

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
      <span
        title={name}
        className="relative text-white font-bold text-sm leading-tight drop-shadow-sm line-clamp-2"
      >
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
  t: ReturnType<typeof import("next-intl").useTranslations>;
  tPos: ReturnType<typeof import("next-intl").useTranslations>;
  /** Result selected with the arrow keys (Enter adds it) */
  highlightedIndex?: number;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {products.map((product, index) => {
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
              <span
                title={product.name}
                className="font-semibold text-xs leading-snug text-gray-800 line-clamp-2"
              >
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
              {isOut && (
                <span className="text-[10px] leading-none text-gray-400">{tPos("noStockHint")}</span>
              )}
              <span className="mt-auto text-green-700 font-bold text-sm tabular-nums">
                {hasPrice ? (
                  formatCurrency(product.price)
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

function newCheckoutId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function POSClient() {
  const t = useTranslations("sales.pos");
  const tSales = useTranslations("sales");
  const tDash = useTranslations("dashboard");

  // Whole catalog in memory: search is instant and works for the scanner
  const catalog = useCatalog();
  const [search, setSearch] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  // Text of a product that doesn't exist yet, while the "create it" dialog is open
  const [quickCreateText, setQuickCreateText] = useState<string | null>(null);
  const [lastAddedId, setLastAddedId] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  // Cart line whose full name is shown (tap to expand, for touch screens without hover)
  const [expandedCartItemId, setExpandedCartItemId] = useState<string | null>(
    null,
  );
  const paymentRef = useRef<HTMLDivElement>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [amountTendered, setAmountTendered] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [receipt, setReceipt] = useState<SaleRead | null>(null);
  const [discountRules, setDiscountRules] = useState<QuantityDiscountRule[]>(
    [],
  );
  const [priceModalItemId, setPriceModalItemId] = useState<string | null>(null);
  const [selectedWeightQuantityProduct, setSelectedWeightQuantityProduct] =
    useState<PosProduct | null>(null);
  const [priceOverrideMode, setPriceOverrideMode] =
    useState<PriceOverrideMode>("line_total");
  const [overridePriceDraft, setOverridePriceDraft] = useState("");
  const [overrideLineTotalDraft, setOverrideLineTotalDraft] = useState("");
  const [overrideReasonDraft, setOverrideReasonDraft] = useState("");
  const [priceModalError, setPriceModalError] = useState("");
  const [subtotalModalOpen, setSubtotalModalOpen] = useState(false);
  const [subtotalDraft, setSubtotalDraft] = useState("");
  const [subtotalReasonDraft, setSubtotalReasonDraft] = useState("");
  const [subtotalModalError, setSubtotalModalError] = useState("");
  const [appliedSubtotalOverride, setAppliedSubtotalOverride] = useState<{
    amount: number;
    reason: string;
  } | null>(null);

  // Category browse state (derived from the catalog)
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const loadingCategories = catalog.loading;
  const loadingCategoryProducts = catalog.loading;
  const categories = useMemo(
    () =>
      [...new Set(catalog.products.map((p) => p.category).filter((c): c is string => !!c))].sort(
        (a, b) => a.localeCompare(b),
      ),
    [catalog.products],
  );
  const categoryProducts = useMemo(
    () => (activeCategory ? catalog.products.filter((p) => p.category === activeCategory) : []),
    [catalog.products, activeCategory],
  );

  // Credit customer state
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerRead[]>([]);
  const [customerPartialPayment, setCustomerPartialPayment] = useState<
    number | null
  >(null);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRead | null>(
    null,
  );
  const [loadingCustomers, setLoadingCustomers] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const tenderedRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);
  // Identifies this checkout; the server returns the same sale if it's sent twice
  const checkoutIdRef = useRef(newCheckoutId());
  // "Enter on an empty search" first arms the charge, the second Enter charges
  const [chargeArmed, setChargeArmed] = useState(false);
  const customerSearchRef = useRef<HTMLInputElement>(null);

  const multiplier = parseMultiplier(search);
  const products = useMemo(
    () => searchCatalog(catalog.products, multiplier.term),
    [catalog.products, multiplier.term],
  );
  const loadingProducts = catalog.loading;
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

  useEffect(() => {
    paymentRef.current && autoAnimate(paymentRef.current);
  }, [paymentRef, receipt]);

  useEffect(() => {
    if (cart.length === 0) {
      setAppliedSubtotalOverride(null);
      setPriceModalItemId(null);
    }
  }, [cart.length]);

  // Autofocus search on mount + discount rules (categories come from the catalog)
  useEffect(() => {
    searchRef.current?.focus();
    (async () => {
      try {
        const res = await fetch("/api/discount-rules", { cache: "no-store" });
        if (res.ok) setDiscountRules(await res.json());
      } catch {
        /* silent */
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

  // Changing the sale cancels a pending "Enter again to charge"
  useEffect(() => {
    setChargeArmed(false);
  }, [cart, paymentMethod, search]);

  // Arrow-key selection starts at the best match whenever the results change
  useEffect(() => {
    setHighlighted(0);
  }, [multiplier.term]);
  useEffect(() => {
    document.querySelector('[data-highlighted="true"]')?.scrollIntoView({ block: "nearest" });
  }, [highlighted]);

  function handleTyping(e: React.ChangeEvent<HTMLInputElement>) {
    setSearch(e.target.value);
    setScanNotice(null);
  }

  function toSaleUnits(quantity: number, unitType: string) {
    return unitType === "gram" ? quantity / 1000 : quantity;
  }

  function lineSubtotal(unitPrice: number, quantity: number, unitType: string) {
    return unitType === "gram"
      ? (unitPrice * quantity) / 1000
      : unitPrice * quantity;
  }

  function getPricing(item: CartItem) {
    const baseUnitPrice = item.unitPrice;
    const baseSubtotal = lineSubtotal(
      baseUnitPrice,
      item.quantity,
      item.unitType,
    );

    if (item.manualOverridePrice != null) {
      const effectiveSubtotal = lineSubtotal(
        item.manualOverridePrice,
        item.quantity,
        item.unitType,
      );
      return {
        baseUnitPrice,
        effectiveUnitPrice: item.manualOverridePrice,
        baseSubtotal,
        effectiveSubtotal,
        discountAmount: Math.max(0, baseSubtotal - effectiveSubtotal),
        discountRuleName: null,
        pricingSource: "manual_override" as const,
      };
    }

    const saleUnits = toSaleUnits(item.quantity, item.unitType);
    const matching = discountRules.filter((r) => {
      const minQty = parseFloat(r.min_qty || "0");
      if (saleUnits < minQty) return false;
      if (r.scope === "item" && r.item_id !== item.itemId) return false;
      if (r.scope === "category" && r.category !== item.category) return false;
      return true;
    });

    let effectiveUnitPrice = baseUnitPrice;
    let ruleName: string | null = null;

    for (const rule of matching) {
      let candidate = baseUnitPrice;
      if (rule.rule_type === "percent" && rule.percent_off != null) {
        candidate = baseUnitPrice * (1 - parseFloat(rule.percent_off) / 100);
      } else if (
        rule.rule_type === "fixed_price" &&
        rule.fixed_unit_price != null
      ) {
        const minQty = parseFloat(rule.min_qty || "0");
        if (minQty > 0) {
          candidate = parseFloat(rule.fixed_unit_price) / minQty;
        }
      } else if (
        rule.rule_type === "buy_x_get_y" &&
        rule.buy_qty != null &&
        rule.free_qty != null
      ) {
        const buyQty = parseFloat(rule.buy_qty);
        const freeQty = parseFloat(rule.free_qty);
        const group = buyQty + freeQty;
        if (group > 0) {
          const groups = Math.floor(saleUnits / group);
          const freeUnits = groups * freeQty;
          const payableUnits = Math.max(0, saleUnits - freeUnits);
          candidate =
            saleUnits > 0
              ? (baseUnitPrice * payableUnits) / saleUnits
              : baseUnitPrice;
        }
      }

      if (candidate < effectiveUnitPrice) {
        effectiveUnitPrice = candidate;
        ruleName = rule.name;
      }
    }

    const effectiveSubtotal = lineSubtotal(
      effectiveUnitPrice,
      item.quantity,
      item.unitType,
    );
    return {
      baseUnitPrice,
      effectiveUnitPrice,
      baseSubtotal,
      effectiveSubtotal,
      discountAmount: Math.max(0, baseSubtotal - effectiveSubtotal),
      discountRuleName: ruleName,
      pricingSource: ruleName
        ? ("quantity_discount" as const)
        : ("base" as const),
    };
  }

  const cartTotal = cart.reduce(
    (sum, c) => sum + getPricing(c).effectiveSubtotal,
    0,
  );
  const finalTotal = appliedSubtotalOverride?.amount ?? cartTotal;
  const tenderedNum = parseFloat(amountTendered) || 0;
  // An empty "received" field means the customer paid the exact amount
  const effectiveTendered = amountTendered.trim() === "" ? finalTotal : tenderedNum;
  const change = tenderedNum - finalTotal;

  const hasInvalidOverride = cart.some(
    (c) =>
      c.manualOverridePrice != null && !(c.manualOverrideReason || "").trim(),
  );

  const canComplete =
    cart.length > 0 &&
    (paymentMethod !== "cash" || effectiveTendered >= finalTotal) &&
    (paymentMethod !== "credit" || selectedCustomer != null) &&
    !hasInvalidOverride;

  /**
   * Add a product. `quantity` is a count for unit products, or grams for weighed ones
   * (weighed products without a quantity open the weight panel).
   */
  function addToCart(product: PosProduct, quantity: number | null = null) {
    const isWeightBased = product.unit_type === "gram";
    if (isWeightBased && quantity == null) {
      setSelectedWeightQuantityProduct(product);
      return;
    }

    if (!product.price) return;
    const price = parseFloat(product.price);
    const amount = quantity ?? 1;
    setCart((prev) => {
      const existing = prev.find((c) => c.itemId === product.id);
      if (existing) {
        // Most recent line goes last, so "+", "-" and Del act on it
        return [
          ...prev.filter((c) => c.itemId !== product.id),
          { ...existing, quantity: existing.quantity + amount },
        ];
      }
      return [
        ...prev,
        {
          itemId: product.id,
          name: product.name,
          unitType: product.unit_type ?? "unit",
          category: product.category ?? null,
          unitPrice: price,
          quantity: amount,
        },
      ];
    });
    setLastAddedId(product.id);
    setTimeout(() => setLastAddedId((id) => (id === product.id ? null : id)), 700);
    setScanNotice(null);
    // Ready for the next product
    if (search.trim()) setSearch("");
    setTimeout(() => searchRef.current?.focus(), 0);
  }

  /** A scanned or typed code: exact SKU match adds immediately. Returns false when unknown. */
  function addByCode(code: string, quantity: number | null): boolean {
    const product = findBySku(catalog.products, code);
    if (!product) return false;
    addToCart(product, product.unit_type === "gram" ? null : quantity);
    return true;
  }

  useBarcodeScanner((code) => {
    if (!addByCode(code, null)) setScanNotice(code);
  }, !selectedWeightQuantityProduct && !priceModalItemId && !subtotalModalOpen && quickCreateText == null);

  function updateQty(itemId: string, qty: number) {
    if (qty === null) return;
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

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (products.length === 0) return;
      e.preventDefault();
      setHighlighted((i) =>
        e.key === "ArrowDown" ? Math.min(i + 1, products.length - 1) : Math.max(i - 1, 0),
      );
      return;
    }
    if (e.key === "Escape") {
      setSearch("");
      setScanNotice(null);
      setChargeArmed(false);
      return;
    }
    if (e.key !== "Enter") return;

    const term = multiplier.term.trim();
    if (!term) {
      // Empty search + Enter: first press asks for confirmation, second press charges
      if (cart.length > 0 && canComplete) {
        e.preventDefault();
        if (chargeArmed) handleCompleteSale();
        else setChargeArmed(true);
      }
      return;
    }
    e.preventDefault();
    // Barcode (scanned into the field) or exact SKU first, then the highlighted result
    if (addByCode(term, multiplier.quantity)) return;
    const product = products[highlighted] ?? products[0];
    if (product) {
      addToCart(product, product.unit_type === "gram" ? null : multiplier.quantity);
    } else {
      setScanNotice(term);
    }
  }

  // ── Keyboard shortcuts (F1 search, F2/F3/F4 payment, F9 charge, +/−/Del last line) ──
  const shortcutHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  shortcutHandler.current = (e: KeyboardEvent) => {
    if (selectedWeightQuantityProduct || priceModalItemId || subtotalModalOpen || quickCreateText != null) return;
    const inSearch = e.target === searchRef.current;
    const typingElsewhere = isTypingField(e.target) && !inSearch;
    const last = cart[cart.length - 1];

    switch (e.key) {
      case "F1":
        e.preventDefault();
        searchRef.current?.focus();
        return;
      case "/":
        if (isTypingField(e.target)) return;
        e.preventDefault();
        searchRef.current?.focus();
        return;
      case "F2":
        e.preventDefault();
        choosePaymentMethod("cash");
        setTimeout(() => {
          tenderedRef.current?.focus();
          tenderedRef.current?.select();
        }, 0);
        return;
      case "F3":
        e.preventDefault();
        choosePaymentMethod("card");
        return;
      case "F4":
        e.preventDefault();
        choosePaymentMethod("credit");
        return;
      case "F9":
        e.preventDefault();
        handleCompleteSale();
        return;
      case "+":
      case "-":
        // Only when not typing a value (an empty search box counts as free)
        if (typingElsewhere || (inSearch && search.trim()) || !last) return;
        e.preventDefault();
        updateQty(last.itemId, last.quantity + (e.key === "+" ? 1 : -1) * (last.unitType === "gram" ? 100 : 1));
        return;
      case "Delete":
        if (typingElsewhere || (inSearch && search.trim()) || !last) return;
        e.preventDefault();
        removeFromCart(last.itemId);
        return;
    }
  };
  useEffect(() => {
    const listener = (e: KeyboardEvent) => shortcutHandler.current(e);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  async function handleCompleteSale() {
    // Shortcuts and Enter can fire twice before React re-renders: the ref blocks it instantly
    if (!canComplete || submittingRef.current) return;
    if (customerPartialPayment && customerPartialPayment > finalTotal) {
      setErrorMsg(t("partialPaymentExceedsTotal"));
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setErrorMsg("");
    const result = await createSale({
      request_id: checkoutIdRef.current,
      items: cart.map((c) => ({
        item_id: c.itemId,
        quantity: c.quantity,
        unit_price_override: c.manualOverridePrice,
        manual_override_reason: c.manualOverrideReason,
      })),
      payment_method: paymentMethod,
      amount_tendered: paymentMethod === "cash" ? effectiveTendered : undefined,
      customer_id:
        paymentMethod === "credit" ? selectedCustomer?.id : undefined,
      subtotal_override: appliedSubtotalOverride?.amount,
      subtotal_override_reason: appliedSubtotalOverride?.reason,
      // Saved in the same transaction as the sale: all or nothing
      partial_payment:
        paymentMethod === "credit" && customerPartialPayment ? customerPartialPayment : undefined,
    });

    submittingRef.current = false;
    setSubmitting(false);
    if (result.error) {
      // Retrying keeps the same checkout id, so a sale that did go through is never duplicated
      setErrorMsg(typeof result.error === "string" ? result.error : "Error");
    } else if (result.data) {
      checkoutIdRef.current = newCheckoutId();
      setChargeArmed(false);
      const finalReceipt = {
        ...result.data,
        customer_partial_payment:
          customerPartialPayment != null
            ? String(customerPartialPayment)
            : null,
      };
      setReceipt(finalReceipt);
      setCart([]);
      setPaymentMethod("cash");
      catalog.refresh();
      setTimeout(() => searchRef.current?.focus(), 0);
      setAmountTendered("");
      setSelectedCustomer(null);
      setCustomerSearch("");
      setCustomerResults([]);
      setAppliedSubtotalOverride(null);
      setSubtotalDraft("");
      setSubtotalReasonDraft("");
      setCustomerPartialPayment(null);
    }
  }

  function openPriceEditor(item: CartItem) {
    const pricing = getPricing(item);
    setPriceModalItemId(item.itemId);
    setPriceOverrideMode("line_total");
    setOverridePriceDraft(
      String(item.manualOverridePrice ?? pricing.effectiveUnitPrice),
    );
    setOverrideLineTotalDraft(String(pricing.effectiveSubtotal));
    setOverrideReasonDraft(item.manualOverrideReason ?? "Cambio de precio"); // put translation here
    setPriceModalError("");
  }

  function roundUpToNearest500(itemId: string) {
    const item = cart.find((entry) => entry.itemId === itemId);
    if (!item) return;

    if (item.manualOverrideReason === "Redondeo") {
      clearManualOverride(itemId);
      return;
    }

    let currentLinePrice = 0;
    let finalOverrideUnitPrice = 0;

    if (item.unitType === "gram") {
      // 1. Calculate what they are currently paying for this weight
      // If unitPrice is 7000 (per kg), then 7000 / 1000 = 7₲ per gram.
      // 7₲ * 121 grams = 847₲ raw total.
      const pricePerSingleGram = item.unitPrice / 1000;
      currentLinePrice = pricePerSingleGram * item.quantity;

      // 2. Round that total line price up to the nearest 500
      // Math.ceil(847 / 500) * 500 = 1000₲
      const roundedLinePrice = Math.ceil(currentLinePrice / 500) * 500;

      // 3. Back-calculate the new price per single gram
      // 1000₲ total / 121 grams = 8.264₲ per gram
      const roundedPricePerGram = roundedLinePrice / item.quantity;

      // 4. Convert it back to your system's base unit price (per kilo)
      // 8.264₲ * 1000 = 8264₲ per kilo
      finalOverrideUnitPrice = roundedPricePerGram * 1000;
    } else {
      // Standard item calculation (pieces/units)
      currentLinePrice = item.unitPrice * item.quantity;
      const roundedLinePrice = Math.ceil(currentLinePrice / 500) * 500;

      // Divide by quantity to get the new unit price for a single piece
      finalOverrideUnitPrice = roundedLinePrice / item.quantity;
    }

    if (Number.isNaN(finalOverrideUnitPrice) || finalOverrideUnitPrice < 0) {
      setPriceModalError(t("invalidOverrideAmount"));
      return;
    }

    setCart((prev) =>
      prev.map((c) =>
        c.itemId === itemId
          ? {
              ...c,
              // We now safely pass the adjusted per-unit price back to the cart
              manualOverridePrice: finalOverrideUnitPrice,
              manualOverrideReason: "Redondeo", // put translation here
            }
          : c,
      ),
    );
    setPriceModalError("");
  }

  function applyManualOverride(itemId: string) {
    const item = cart.find((entry) => entry.itemId === itemId);
    if (!item) return;

    const reason = overrideReasonDraft.trim();
    if (!reason) {
      setPriceModalError(t("overrideReasonRequired"));
      return;
    }

    let value = parseFloat(overridePriceDraft);
    if (priceOverrideMode === "line_total") {
      const lineTotal = parseFloat(overrideLineTotalDraft);
      const saleUnits = toSaleUnits(item.quantity, item.unitType);
      if (Number.isNaN(lineTotal) || lineTotal < 0 || saleUnits <= 0) {
        setPriceModalError(t("invalidOverrideAmount"));
        return;
      }
      value = lineTotal / saleUnits;
    }

    if (Number.isNaN(value) || value < 0) {
      setPriceModalError(t("invalidOverrideAmount"));
      return;
    }

    setCart((prev) =>
      prev.map((c) =>
        c.itemId === itemId
          ? {
              ...c,
              manualOverridePrice: value,
              manualOverrideReason: reason,
            }
          : c,
      ),
    );
    setPriceModalItemId(null);
    setPriceModalError("");
  }

  function clearManualOverride(itemId: string) {
    setCart((prev) =>
      prev.map((c) =>
        c.itemId === itemId
          ? {
              ...c,
              manualOverridePrice: undefined,
              manualOverrideReason: undefined,
            }
          : c,
      ),
    );
    if (priceModalItemId === itemId) setPriceModalItemId(null);
  }

  function openSubtotalEditor() {
    setSubtotalModalOpen(true);
    setSubtotalDraft(String(appliedSubtotalOverride?.amount ?? cartTotal));
    setSubtotalReasonDraft(appliedSubtotalOverride?.reason ?? "");
    setSubtotalModalError("");
  }

  function applySubtotalOverride() {
    const amount = parseFloat(subtotalDraft);
    const reason = subtotalReasonDraft.trim();

    if (Number.isNaN(amount) || amount < 0) {
      setSubtotalModalError(t("invalidOverrideAmount"));
      return;
    }
    if (!reason) {
      setSubtotalModalError(t("overrideReasonRequired"));
      return;
    }

    setAppliedSubtotalOverride({ amount, reason });
    setSubtotalModalOpen(false);
    setSubtotalModalError("");
  }

  function clearSubtotalOverride() {
    setAppliedSubtotalOverride(null);
    setSubtotalModalOpen(false);
    setSubtotalModalError("");
  }

  const dismissReceipt = useCallback(() => setReceipt(null), []);

  // Step bar: 1 products → 2 payment → 3 done
  const currentStep = cart.length > 0 ? 1 : receipt ? 2 : 0;

  function choosePaymentMethod(m: PaymentMethod) {
    setPaymentMethod(m);
    setErrorMsg("");
    if (m !== "credit") {
      setSelectedCustomer(null);
      setCustomerSearch("");
      setCustomerResults([]);
    }
    if (m === "credit") setTimeout(() => customerSearchRef.current?.focus(), 0);
  }

  return (
    <>
      <div className="flex h-[calc(100vh-6rem)] gap-0 -m-8">
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
                onChange={handleTyping}
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
              <p role="alert" className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800">
                <PackageX size={14} />
                <span className="flex-1">{t("codeNotFound", { code: scanNotice })}</span>
                <button
                  type="button"
                  onClick={() => setQuickCreateText(scanNotice)}
                  className="shrink-0 rounded-md bg-amber-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-amber-700"
                >
                  {t("quickCreate.createWithCode")}
                </button>
              </p>
            )}
            {chargeArmed && (
              <p role="alert" className="mt-2 flex items-center gap-1.5 rounded-lg bg-green-600 px-2.5 py-2 text-sm font-semibold text-white">
                {t("pressEnterToCharge", { total: formatCurrency(finalTotal) })}
              </p>
            )}
            {!search.trim() && !scanNotice && !chargeArmed && (
              <p className="mt-2 ml-1 hidden text-[11px] text-gray-400 md:block">{t("shortcutsHint")}</p>
            )}

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
                <span
                  title={activeCategory}
                  className="text-xs font-semibold text-gray-700 truncate"
                >
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
                  {multiplier.term.trim() && (
                    <Button
                      type="button"
                      onClick={() => setQuickCreateText(multiplier.term.trim())}
                      className="gap-1.5 bg-green-600 hover:bg-green-700"
                    >
                      <Plus size={15} /> {t("quickCreate.createNamed", { name: multiplier.term.trim() })}
                    </Button>
                  )}
                </div>
              ) : (
                <ProductGrid
                  products={products}
                  onAdd={(p) => addToCart(p, p.unit_type === "gram" ? null : multiplier.quantity)}
                  t={tDash}
                  tPos={t}
                  highlightedIndex={highlighted}
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
        <div className="w-[26rem] flex flex-col bg-white overflow-hidden">
          <div className="px-4 pt-3">
            <StepBar steps={[t("stepProducts"), t("stepPayment"), t("stepDone")]} current={currentStep} />
          </div>
          {receipt && <SaleDoneBanner sale={receipt} onDismiss={dismissReceipt} />}
          {/* Cart header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b bg-white">
            <div className="flex items-center gap-2">
              <ShoppingCart size={18} className="text-gray-600" />
              <h3 className="font-semibold text-gray-800">{t("cart")}</h3>
              {cart.length > 0 && (
                <span className="bg-green-100 text-green-700 text-xs font-bold px-1.5 py-0.5 rounded-full leading-none">
                  {formatNumber(
                    cart.reduce((s, c) => {
                      const val = c.quantity ? c.quantity : 0;
                      return s + (c.unitType === "gram" ? val / 1000 : val);
                    }, 0),
                  )}
                </span>
              )}
            </div>
            {cart.length > 0 && (
              <button
                onClick={() => {
                  setCart([]);
                  setAppliedSubtotalOverride(null);
                }}
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
              cart.map((item) => {
                const pricing = getPricing(item);
                return (
                  <div
                    key={item.itemId}
                    className={`rounded-lg border px-3 py-2.5 transition-colors duration-500 ${
                      lastAddedId === item.itemId
                        ? "border-green-300 bg-green-50"
                        : "border-gray-100 bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p
                          title={item.name}
                          onClick={() =>
                            setExpandedCartItemId((prev) =>
                              prev === item.itemId ? null : item.itemId,
                            )
                          }
                          className={`text-sm font-medium text-gray-800 leading-tight break-words cursor-pointer ${
                            expandedCartItemId === item.itemId
                              ? ""
                              : "line-clamp-2"
                          }`}
                        >
                          {item.name}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          {pricing.pricingSource === "base" ? (
                            <span className="text-xs text-gray-500">
                              {item.unitType === "gram"
                                ? `${formatCurrency(pricing.effectiveUnitPrice)}/kg`
                                : formatCurrency(pricing.effectiveUnitPrice)}
                            </span>
                          ) : (
                            <>
                              <span className="text-xs text-gray-400 line-through">
                                {item.unitType === "gram"
                                  ? `${formatCurrency(pricing.baseUnitPrice)}/kg`
                                  : formatCurrency(pricing.baseUnitPrice)}
                              </span>
                              <span className="text-xs text-green-700 font-semibold">
                                {item.unitType === "gram"
                                  ? `${formatCurrency(pricing.effectiveUnitPrice)}/kg`
                                  : formatCurrency(pricing.effectiveUnitPrice)}
                              </span>
                            </>
                          )}
                          <span className="text-[10px] font-bold text-gray-400 bg-gray-200 px-1 py-0.5 rounded leading-none">
                            {tDash(`unitAbbr.${item.unitType}`)}
                          </span>
                          {pricing.pricingSource === "manual_override" && (
                            <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-1 py-0.5 rounded leading-none">
                              {t("manualPrice")}
                            </span>
                          )}
                          {pricing.pricingSource === "quantity_discount" &&
                            pricing.discountRuleName && (
                              <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1 py-0.5 rounded leading-none">
                                {t("discountApplied")}:{" "}
                                {pricing.discountRuleName}
                              </span>
                            )}
                        </div>
                      </div>

                      {/* Qty controls */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() =>
                            updateQty(
                              item.itemId,
                              item.quantity -
                                (item.unitType === "gram" ? 100 : 1),
                            )
                          }
                          className="w-6 h-6 rounded-md bg-gray-200 hover:bg-gray-300 text-gray-600 flex items-center justify-center transition-colors"
                        >
                          <Minus size={11} />
                        </button>
                        <input
                          type="number"
                          value={String(item.quantity)}
                          min={1}
                          step={item.unitType === "gram" ? 100 : 1}
                          onChange={(e) =>
                            updateQty(item.itemId, parseFloat(e.target.value))
                          }
                          onBlur={() => {
                            if (!item.quantity) {
                              updateQty(item.itemId, 1);
                            }
                          }}
                          className="w-14 text-center text-xs border border-gray-200 rounded-md py-1 font-mono bg-white"
                        />
                        <button
                          onClick={() =>
                            updateQty(
                              item.itemId,
                              item.quantity +
                                (item.unitType === "gram" ? 100 : 1),
                            )
                          }
                          className="w-6 h-6 rounded-md bg-gray-200 hover:bg-gray-300 text-gray-600 flex items-center justify-center transition-colors"
                        >
                          <Plus size={11} />
                        </button>
                      </div>

                      {/* Subtotal and Price Edit */}
                      <button
                        onClick={() => openPriceEditor(item)}
                        className="text-gray-300 hover:text-blue-500 transition-colors ml-0.5 shrink-0"
                        title={t("editLinePrice")}
                      >
                        <span className="text-sm font-semibold text-gray-800 font-mono w-16 text-right shrink-0">
                          {formatCurrency(pricing.effectiveSubtotal)}
                        </span>
                      </button>

                      {/* Round up money */}
                      <button
                        onClick={() => roundUpToNearest500(item.itemId)}
                        className="text-gray-300 hover:text-blue-500 transition-colors ml-0.5 shrink-0"
                        title={t("roundPrice")}
                      >
                        <DollarSign size={14} />
                      </button>

                      {/* Remove */}
                      <button
                        onClick={() => removeFromCart(item.itemId)}
                        className="text-gray-300 hover:text-red-400 transition-colors ml-0.5 shrink-0"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* ── Payment section ── */}
          {/* Step 2 is always visible once there is something to charge */}
          <div ref={paymentRef} className="border-t">
            {cart.length > 0 && (
              <div className=" bg-white">
                {/* Total */}
                <div className="flex items-center justify-between px-5 py-3 border-b bg-gray-50">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-500">
                      {t("subtotal")}
                    </span>
                    <button
                      type="button"
                      onClick={openSubtotalEditor}
                      className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-600 hover:border-blue-300 hover:text-blue-600"
                    >
                      <DollarSign size={12} />
                      {t("editSubtotal")}
                    </button>
                    {appliedSubtotalOverride && (
                      <button
                        type="button"
                        onClick={clearSubtotalOverride}
                        className="text-[11px] font-semibold text-red-500 hover:text-red-600"
                      >
                        {t("resetPrice")}
                      </button>
                    )}
                  </div>
                  <span className="text-2xl font-bold text-gray-900 tabular-nums">
                    {formatCurrency(finalTotal)}
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
                            { method: "cash", Icon: Banknote, key: "F2" },
                            { method: "card", Icon: CreditCard, key: "F3" },
                            { method: "credit", Icon: Users, key: "F4" },
                            { method: "other", Icon: RefreshCcw },
                            { method: "internal", Icon: Crown },
                          ] as {
                            method: PaymentMethod;
                            Icon: React.ElementType;
                            key?: string;
                          }[]
                        ).map(({ method: m, Icon, key }) => (
                          <button
                            key={m}
                            onClick={() => choosePaymentMethod(m)}
                            title={key ? `${tSales(`paymentMethod.${m}`)} (${key})` : undefined}
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
                            {key && (
                              <kbd className="hidden md:inline rounded border border-current/20 px-1 font-mono text-[9px] font-medium leading-tight opacity-70">
                                {key}
                              </kbd>
                            )}
                          </button>
                        ))}
                      </div>

                      {/* Left Fade/Button */}
                      {showLeftArrow && (
                        <div className="rounded-xl absolute left-0 top-0 bottom-1 w-8 bg-gradient-to-r from-black/40 to-transparent opacity-0 hover:opacity-100 transition-opacity flex items-center justify-start group/btn">
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
                        <div className="rounded-xl absolute right-0 top-0 bottom-1 w-8 bg-gradient-to-l from-black/40 to-transparent opacity-0 hover:opacity-100 transition-opacity flex items-center justify-end group/btn">
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
                            ref={customerSearchRef}
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
                      <PartialPaymentInput
                        amount={customerPartialPayment}
                        setAmount={setCustomerPartialPayment}
                      />
                    </div>
                  )}

                  {/* Cash tendered + change */}
                  {paymentMethod === "cash" && (
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-widest">
                        {t("amountTendered")}
                      </label>
                      <Input
                        ref={tenderedRef}
                        type="number"
                        inputMode="numeric"
                        min={finalTotal ? finalTotal.toString() : "0"}
                        step="1"
                        value={amountTendered}
                        onChange={(e) => setAmountTendered(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleCompleteSale();
                          }
                        }}
                        placeholder={formatNumber(finalTotal)}
                        className="text-lg font-mono h-11 border-gray-200"
                      />
                      {/* One tap for the usual bills */}
                      <div className="grid grid-cols-4 gap-1.5">
                        {suggestCashAmounts(finalTotal).map((amount, i) => (
                          <button
                            key={amount}
                            type="button"
                            onClick={() => {
                              setAmountTendered(String(amount));
                              tenderedRef.current?.focus();
                            }}
                            className={`h-9 rounded-lg border text-xs font-semibold tabular-nums transition-colors ${
                              tenderedNum === amount
                                ? "border-green-500 bg-green-50 text-green-700"
                                : "border-gray-200 text-gray-600 hover:bg-gray-50"
                            }`}
                          >
                            {i === 0 ? t("exactAmount") : formatNumber(amount)}
                          </button>
                        ))}
                      </div>
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
                      <Crown
                        size={16}
                        className="text-purple-500 shrink-0 mt-0.5"
                      />
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
                    } ${chargeArmed ? "ring-4 ring-green-300 animate-pulse" : ""}`}
                  >
                    {submitting ? t("processing") : t("completeSale")}
                    <kbd className="ml-2 hidden md:inline rounded border border-current/30 px-1.5 font-mono text-[10px] font-medium opacity-80">
                      F9
                    </kbd>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {priceModalItemId &&
        (() => {
          const modalItem = cart.find(
            (item) => item.itemId === priceModalItemId,
          );
          if (!modalItem) return null;
          const pricing = getPricing(modalItem);
          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
              onClick={(e) => {
                if (e.target === e.currentTarget) setPriceModalItemId(null);
              }}
            >
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <DollarSign size={16} className="text-blue-500" />
                    <h3 className="font-semibold text-gray-800">
                      {t("priceOverrideTitle")}
                    </h3>
                  </div>
                  <button
                    onClick={() => setPriceModalItemId(null)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="px-5 py-5 space-y-4">
                  <div className="rounded-xl bg-gray-50 px-4 py-3">
                    <p className="text-sm font-semibold text-gray-800">
                      {modalItem.name}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {t("currentUnitPrice")}:{" "}
                      {formatCurrency(pricing.effectiveUnitPrice)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {t("currentLineTotal")}:{" "}
                      {formatCurrency(pricing.effectiveSubtotal)}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPriceOverrideMode("line_total")}
                      className={`rounded-xl border-2 px-3 py-2 text-xs font-semibold transition-colors ${
                        priceOverrideMode === "line_total"
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-gray-200 text-gray-500 hover:border-gray-300"
                      }`}
                    >
                      {t("overrideByLineTotal")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPriceOverrideMode("unit")}
                      className={`rounded-xl border-2 px-3 py-2 text-xs font-semibold transition-colors ${
                        priceOverrideMode === "unit"
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-gray-200 text-gray-500 hover:border-gray-300"
                      }`}
                    >
                      {t("overrideByUnit")}
                    </button>
                  </div>

                  {priceOverrideMode === "unit" ? (
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-gray-600">
                        {t("newUnitPrice")}
                      </label>
                      <Input
                        type="number"
                        step="1"
                        min="0"
                        value={overridePriceDraft}
                        onChange={(e) => setOverridePriceDraft(e.target.value)}
                        className="h-10 text-sm font-mono"
                      />
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-gray-600">
                        {t("lineTotalPrice")}
                      </label>
                      <Input
                        type="number"
                        step="100"
                        min="0"
                        value={overrideLineTotalDraft}
                        onChange={(e) =>
                          setOverrideLineTotalDraft(e.target.value)
                        }
                        className="h-10 text-sm font-mono"
                      />
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-600">
                      {t("overrideReason")}
                    </label>
                    <Input
                      value={overrideReasonDraft}
                      onChange={(e) => setOverrideReasonDraft(e.target.value)}
                      placeholder={t("overrideReason")}
                      className="h-10 text-sm"
                    />
                  </div>

                  {priceModalError && (
                    <p className="text-red-500 text-xs bg-red-50 rounded-lg px-3 py-2">
                      {priceModalError}
                    </p>
                  )}
                </div>

                <div className="px-5 py-4 border-t border-gray-100 bg-white rounded-b-2xl">
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setPriceModalItemId(null)}
                      className="h-10 text-sm"
                    >
                      {t("cancel")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => clearManualOverride(modalItem.itemId)}
                      className="h-10 text-sm"
                    >
                      {t("resetPrice")}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => applyManualOverride(modalItem.itemId)}
                      className="h-10 text-sm bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      {t("applyPrice")}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

      {quickCreateText != null && (
        <QuickCreateProduct
          initialText={quickCreateText}
          catalog={catalog.products}
          categories={categories}
          onClose={() => {
            setQuickCreateText(null);
            setTimeout(() => searchRef.current?.focus(), 0);
          }}
          onReady={(product) => {
            catalog.addLocal(product);
            setQuickCreateText(null);
            setScanNotice(null);
            addToCart(product, product.unit_type === "gram" ? null : multiplier.quantity);
          }}
        />
      )}

      <ProductQuantityModal
        isOpen={!!selectedWeightQuantityProduct}
        onClose={() => setSelectedWeightQuantityProduct(null)}
        onConfirm={addToCart}
        itemSelected={selectedWeightQuantityProduct}
      />

      {subtotalModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSubtotalModalOpen(false);
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <DollarSign size={16} className="text-blue-500" />
                <h3 className="font-semibold text-gray-800">
                  {t("subtotalOverrideTitle")}
                </h3>
              </div>
              <button
                onClick={() => setSubtotalModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={16} />
              </button>
            </div>

            <div className="px-5 py-5 space-y-4">
              <div className="rounded-xl bg-gray-50 px-4 py-3">
                <p className="text-xs text-gray-500">{t("currentSubtotal")}</p>
                <p className="text-2xl font-black text-gray-800 font-mono">
                  {formatCurrency(cartTotal)}
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-600">
                  {t("overrideSubtotal")}
                </label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={subtotalDraft}
                  onChange={(e) => setSubtotalDraft(e.target.value)}
                  placeholder={t("overrideSubtotalPlaceholder")}
                  className="h-10 text-sm font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-600">
                  {t("overrideReason")}
                </label>
                <Input
                  value={subtotalReasonDraft}
                  onChange={(e) => setSubtotalReasonDraft(e.target.value)}
                  placeholder={t("overrideReason")}
                  className="h-10 text-sm"
                />
              </div>

              {subtotalModalError && (
                <p className="text-red-500 text-xs bg-red-50 rounded-lg px-3 py-2">
                  {subtotalModalError}
                </p>
              )}
            </div>

            <div className="px-5 py-4 border-t border-gray-100 bg-white rounded-b-2xl">
              <div className="grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSubtotalModalOpen(false)}
                  className="h-10 text-sm"
                >
                  {t("cancel")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={clearSubtotalOverride}
                  className="h-10 text-sm"
                >
                  {t("resetPrice")}
                </Button>
                <Button
                  type="button"
                  onClick={applySubtotalOverride}
                  className="h-10 text-sm bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {t("applyPrice")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
