"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createSale, SaleRead } from "@/components/actions/sales-action";
import type { ItemRead } from "@/app/openapi-client";
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
  CheckCircle2,
  PackageX,
  ScanBarcode,
  Users,
  Crown,
  DollarSign,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  recordPayment,
  type CustomerRead,
} from "@/components/actions/customers-action";
import autoAnimate from "@formkit/auto-animate";
import ProductQuantityModal from "@/components/Modals/product-quantity-modal";
import { PartialPaymentInput } from "@/components/Pages/sales/new/PosClient/partial-payment-input";

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
  const [showPaymentSection, setShowPaymentSection] = useState(false);
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
    useState<ItemRead | null>(null);
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

  // Category browse state
  const [categories, setCategories] = useState<string[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [categoryProducts, setCategoryProducts] = useState<ItemRead[]>([]);
  const [loadingCategoryProducts, setLoadingCategoryProducts] = useState(false);

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
  const getProductsBySearch = (triggeredByEnter = false) => {
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
          if (triggeredByEnter && data.items && data.items.length === 1) {
            addToCart(data.items[0]);
          }
        }
      } catch {
        // silent fail
      } finally {
        setLoadingProducts(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  };

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
  const change = tenderedNum - finalTotal;

  const hasInvalidOverride = cart.some(
    (c) =>
      c.manualOverridePrice != null && !(c.manualOverrideReason || "").trim(),
  );

  const canComplete =
    cart.length > 0 &&
    (paymentMethod !== "cash" || tenderedNum >= finalTotal) &&
    (paymentMethod !== "credit" || selectedCustomer != null) &&
    !hasInvalidOverride;

  function addToCart(product: ItemRead, weightQuantity: number | null = null) {
    const isWeightBased = product.unit_type === "gram";
    if (isWeightBased && weightQuantity == null) {
      setSelectedWeightQuantityProduct(product);
      return;
    }

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
          category: product.category ?? null,
          unitPrice: price,
          quantity:
            isWeightBased && weightQuantity != null ? weightQuantity : step,
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

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (search) {
      if (e.key === "Enter") {
        getProductsBySearch(true);
      }
      getProductsBySearch();
    }
  }

  async function handleCompleteSale() {
    if (!canComplete) return;
    if (customerPartialPayment && customerPartialPayment > finalTotal) {
      setErrorMsg(t("partialPaymentExceedsTotal"));
      return;
    }
    setSubmitting(true);
    setErrorMsg("");
    const result = await createSale({
      items: cart.map((c) => ({
        item_id: c.itemId,
        quantity: c.quantity,
        unit_price_override: c.manualOverridePrice,
        manual_override_reason: c.manualOverrideReason,
      })),
      payment_method: paymentMethod,
      amount_tendered: paymentMethod === "cash" ? tenderedNum : undefined,
      customer_id:
        paymentMethod === "credit" ? selectedCustomer?.id : undefined,
      subtotal_override: appliedSubtotalOverride?.amount,
      subtotal_override_reason: appliedSubtotalOverride?.reason,
    });
    let partialPaymentResult: { data?: unknown; error?: unknown } | null = null;
    if (
      paymentMethod === "credit" &&
      selectedCustomer &&
      customerPartialPayment != null
    ) {
      partialPaymentResult = await recordPayment(selectedCustomer.id, {
        amount: customerPartialPayment,
        payment_method: "cash",
        notes: "Pago parcial por venta de productos a crédito",
      });
    }

    setSubmitting(false);
    if (result.error || partialPaymentResult?.error) {
      setErrorMsg(typeof result.error === "string" ? result.error : "Error");
    } else if (result.data) {
      const finalReceipt = {
        ...result.data,
        customer_partial_payment:
          customerPartialPayment != null
            ? String(customerPartialPayment)
            : null,
      };
      setReceipt(finalReceipt);
      setCart([]);
      setAmountTendered("");
      setSelectedCustomer(null);
      setCustomerSearch("");
      setCustomerResults([]);
      setShowPaymentSection(false);
      setAppliedSubtotalOverride(null);
      setSubtotalDraft("");
      setSubtotalReasonDraft("");
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
    setOverrideReasonDraft(item.manualOverrideReason ?? "");
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

  function startNewSale() {
    setReceipt(null);
    setTimeout(() => searchRef.current?.focus(), 0);
  }

  function togglePaymentSection() {
    setShowPaymentSection((prev) => !prev);
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
              <>
                <div className="flex justify-between items-center bg-amber-50 rounded-lg px-3 py-2">
                  <span className="text-sm font-medium text-amber-700">
                    {tSales("pos.receiptCustomer")}
                  </span>
                  <span className="text-sm font-bold text-amber-700">
                    {receipt.customer_name}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">
                    {" "}
                    {tSales("pos.receiptCustomerPartialPayment")}
                  </span>
                  <span className="text-xl font-bold text-green-600">
                    {formatCurrency(receipt.customer_partial_payment)}
                  </span>
                </div>
              </>
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
                      ×{formatNumber(parseFloat(si.quantity))}
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
        <div className="w-[26rem] flex flex-col bg-white overflow-hidden">
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
                    className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5"
                  >
                    <div className="flex items-center gap-2">
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate leading-tight">
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

                      {/* Subtotal */}
                      <span className="text-sm font-semibold text-gray-800 font-mono w-16 text-right shrink-0">
                        {formatCurrency(pricing.effectiveSubtotal)}
                      </span>

                      {/* Price Edit */}
                      <button
                        onClick={() => openPriceEditor(item)}
                        className="text-gray-300 hover:text-blue-500 transition-colors ml-0.5 shrink-0"
                        title={t("editLinePrice")}
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
          <div ref={paymentRef}>
            {/* 1. Basic Toggle Button */}
            <button
              onClick={togglePaymentSection}
              className="border border-emerald-600 px-6 py-3 font-semibold rounded-t-xl bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-sm hover:-translate-y-0.5 transition-all duration-150 p-3.5 text-white leading-none select-none w-full"
            >
              {t("openPayment")}
            </button>
            {showPaymentSection && (
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
                            { method: "cash", Icon: Banknote },
                            { method: "credit", Icon: Users },
                            { method: "internal", Icon: Crown },
                            { method: "card", Icon: CreditCard },
                            { method: "other", Icon: RefreshCcw },
                          ] as {
                            method: PaymentMethod;
                            Icon: React.ElementType;
                          }[]
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
                        type="number"
                        min={finalTotal ? finalTotal.toString() : "0"}
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
                    }`}
                  >
                    {submitting ? t("processing") : t("completeSale")}
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
