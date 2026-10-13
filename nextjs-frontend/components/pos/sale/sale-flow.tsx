"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, ShoppingCart } from "lucide-react";

import { createSale, type SaleRead } from "@/components/actions/sales-action";
import type { CustomerRead } from "@/components/actions/customers-action";
import ProductQuantityModal from "@/components/Modals/product-quantity-modal";
import { QuickCreateProduct } from "@/components/pos/quick-create-product";
import { SaleDoneBanner } from "@/components/pos/sale-done-banner";
import { CartRail } from "@/components/pos/sale/cart-rail";
import { CatalogPanel } from "@/components/pos/sale/catalog-panel";
import { PriceOverrideDialog, SubtotalOverrideDialog } from "@/components/pos/sale/price-dialogs";
import { SaleDonePanel } from "@/components/pos/sale/sale-done-panel";
import { StepCheckout } from "@/components/pos/sale/step-checkout";
import { StepBar } from "@/components/pos/step-bar";
import { formatCurrency } from "@/lib/currency";
import { findBySku, type PosProduct } from "@/lib/pos/catalog-search";
import {
  cartTotal,
  getPricing,
  quantityStep,
  roundedUnitPrice,
  type CartItem,
  type QuantityDiscountRule,
} from "@/lib/pos/pricing";
import {
  PAYMENT_METHODS,
  checkoutBlockers,
  newCheckoutId,
  toSaleCreate,
  type PaymentMethod,
} from "@/lib/pos/sale";
import { isTypingField, useBarcodeScanner } from "@/lib/pos/use-barcode-scanner";
import { useCatalog } from "@/lib/pos/use-catalog";

type Step = "cart" | "checkout" | "done";
const STEP_INDEX: Record<Step, number> = { cart: 0, checkout: 1, done: 2 };

/**
 * New sale in 2 steps + done: pick products (scan / search / categories), then charge.
 * The fastest cash sale is scan… → F9 → Enter.
 */
export function SaleFlow() {
  const t = useTranslations("sales.pos");

  // Whole catalog in memory: search is instant and works for the scanner
  const catalog = useCatalog();
  const categories = useMemo(
    () =>
      [...new Set(catalog.products.map((p) => p.category).filter((c): c is string => !!c))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [catalog.products],
  );
  const [discountRules, setDiscountRules] = useState<QuantityDiscountRule[]>([]);

  const [step, setStep] = useState<Step>("cart");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [lastAddedId, setLastAddedId] = useState<string | null>(null);
  const [subtotalOverride, setSubtotalOverride] = useState<{ amount: number; reason: string } | null>(null);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);

  // Dialogs
  const [priceItemId, setPriceItemId] = useState<string | null>(null);
  const [subtotalOpen, setSubtotalOpen] = useState(false);
  const [weighProduct, setWeighProduct] = useState<PosProduct | null>(null);
  // Product that doesn't exist yet, while the "create it" dialog is open
  const [quickCreate, setQuickCreate] = useState<{ text: string; quantity: number | null } | null>(null);
  const dialogOpen = priceItemId != null || subtotalOpen || weighProduct != null || quickCreate != null;

  // Payment
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [tendered, setTendered] = useState("");
  const [customer, setCustomer] = useState<CustomerRead | null>(null);
  const [partialPayment, setPartialPayment] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  // Shown big on the done step, then as a small banner (reprint) over the cart
  const [lastSale, setLastSale] = useState<SaleRead | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  // Shortcuts and Enter can fire twice before React re-renders: the ref blocks it instantly
  const submittingRef = useRef(false);
  // Identifies this checkout; the server returns the same sale if it's sent twice
  const checkoutIdRef = useRef(newCheckoutId());

  const pricingOf = useCallback((item: CartItem) => getPricing(item, discountRules), [discountRules]);
  const subtotal = cartTotal(cart, discountRules);
  const total = subtotalOverride?.amount ?? subtotal;
  const checkout = {
    cart,
    method,
    tendered,
    total,
    customerId: customer?.id ?? null,
    partialPayment,
  };
  const blockers = checkoutBlockers(checkout);
  const roundingReason = t("roundingReason");

  const focusSearch = () => setTimeout(() => searchRef.current?.focus(), 0);

  useEffect(() => {
    focusSearch();
    (async () => {
      try {
        const res = await fetch("/api/discount-rules", { cache: "no-store" });
        if (res.ok) setDiscountRules(await res.json());
      } catch {
        /* silent */
      }
    })();
  }, []);

  // An empty cart has nothing to adjust or charge
  useEffect(() => {
    if (cart.length > 0) return;
    setSubtotalOverride(null);
    setPriceItemId(null);
    setStep((s) => (s === "checkout" ? "cart" : s));
  }, [cart.length]);

  // ── Cart ───────────────────────────────────────────────────────────────────

  /**
   * Add a product. `quantity` is a count for unit products, or grams for weighed ones
   * (weighed products without a quantity open the weight panel).
   */
  function addToCart(product: PosProduct, quantity: number | null = null) {
    if (product.unit_type === "gram" && quantity == null) {
      setWeighProduct(product);
      return;
    }
    if (!product.price) return;
    const price = parseFloat(product.price);
    const amount = quantity ?? 1;
    setCart((prev) => {
      const existing = prev.find((c) => c.itemId === product.id);
      if (existing) {
        // Most recent line goes last, so "+", "-" and Del act on it
        return [...prev.filter((c) => c.itemId !== product.id), { ...existing, quantity: existing.quantity + amount }];
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
    // A product scanned on the done screen starts the next sale; at checkout it joins the order
    setStep((s) => (s === "done" ? "cart" : s));
    if (step !== "checkout") focusSearch();
  }

  /** A scanned or typed code: exact SKU match adds immediately. Returns false when unknown. */
  function addByCode(code: string, quantity: number | null): boolean {
    const product = findBySku(catalog.products, code);
    if (!product) return false;
    addToCart(product, product.unit_type === "gram" ? null : quantity);
    return true;
  }

  // Always on, even at checkout: a scanner's final Enter must never confirm the sale by accident
  useBarcodeScanner((code) => {
    if (addByCode(code, null)) return;
    setStep("cart");
    setScanNotice(code);
  }, !dialogOpen);

  function updateQty(itemId: string, qty: number) {
    if (Number.isNaN(qty)) return;
    if (qty <= 0) setCart((prev) => prev.filter((c) => c.itemId !== itemId));
    else setCart((prev) => prev.map((c) => (c.itemId === itemId ? { ...c, quantity: qty } : c)));
  }

  function removeFromCart(itemId: string) {
    setCart((prev) => prev.filter((c) => c.itemId !== itemId));
  }

  function setOverride(itemId: string, price: number | undefined, reason: string | undefined) {
    setCart((prev) =>
      prev.map((c) => (c.itemId === itemId ? { ...c, manualOverridePrice: price, manualOverrideReason: reason } : c)),
    );
  }

  const isRounded = (item: CartItem) => item.manualOverrideReason === roundingReason;

  /** Round the line up to the next 500; pressing it again undoes it */
  function toggleRounding(itemId: string) {
    const item = cart.find((c) => c.itemId === itemId);
    if (!item) return;
    if (isRounded(item)) {
      setOverride(itemId, undefined, undefined);
      return;
    }
    const price = roundedUnitPrice(item);
    if (price != null) setOverride(itemId, price, roundingReason);
  }

  // ── Steps ──────────────────────────────────────────────────────────────────

  function goToCheckout(preset?: PaymentMethod) {
    if (cart.length === 0) return;
    if (preset) chooseMethod(preset);
    setError("");
    setMobileCartOpen(false);
    setStep("checkout");
  }

  function backToCart() {
    setStep("cart");
    setError("");
    focusSearch();
  }

  const nextSale = useCallback(() => {
    setStep((s) => (s === "done" ? "cart" : s));
    focusSearch();
  }, []);

  function chooseMethod(m: PaymentMethod) {
    setMethod(m);
    setError("");
    if (m !== "credit") {
      setCustomer(null);
      setPartialPayment(null);
    }
  }

  async function confirmSale() {
    if (blockers.length > 0 || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError("");
    const result = await createSale(
      toSaleCreate({ ...checkout, requestId: checkoutIdRef.current, subtotalOverride }),
    );
    submittingRef.current = false;
    setSubmitting(false);

    if (result.error || !result.data) {
      // Retrying keeps the same checkout id, so a sale that did go through is never duplicated
      setError(typeof result.error === "string" ? result.error : "Error");
      return;
    }
    checkoutIdRef.current = newCheckoutId();
    const sale = {
      ...result.data,
      customer_partial_payment: partialPayment != null ? String(partialPayment) : null,
    };
    setLastSale(sale);
    setStep("done");
    setCart([]);
    setSubtotalOverride(null);
    setMethod("cash");
    setTendered("");
    setCustomer(null);
    setPartialPayment(null);
    catalog.refresh();
  }

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  const shortcutHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  shortcutHandler.current = (e: KeyboardEvent) => {
    if (dialogOpen) return;
    const target = e.target as HTMLElement | null;
    const typing = isTypingField(e.target);
    const fnIndex = PAYMENT_METHODS.findIndex((p) => p.key === e.key);

    if (step === "done") {
      if (e.key === "Enter" || e.key === "Escape" || e.key === "F9") {
        if (target?.closest("button, a") && e.key === "Enter") return;
        e.preventDefault();
        nextSale();
      }
      return;
    }

    if (step === "checkout") {
      if (fnIndex >= 0 || (!typing && /^[1-4]$/.test(e.key))) {
        e.preventDefault();
        chooseMethod(PAYMENT_METHODS[fnIndex >= 0 ? fnIndex : Number(e.key) - 1].method);
        return;
      }
      if (e.key === "Escape" && !e.defaultPrevented) {
        e.preventDefault();
        backToCart();
        return;
      }
      if (e.key === "F9" || (e.key === "Enter" && !e.defaultPrevented && !target?.closest("button, a, textarea"))) {
        e.preventDefault();
        confirmSale();
      }
      return;
    }

    // Step 1
    const inSearch = e.target === searchRef.current;
    const searchHasText = !!searchRef.current?.value.trim();
    const typingElsewhere = typing && !inSearch;
    const last = cart[cart.length - 1];

    if (fnIndex >= 0) {
      // F2–F5 go straight to the payment with that method chosen
      // (with an empty cart F5 stays the browser's reload)
      if (cart.length === 0) return;
      e.preventDefault();
      goToCheckout(PAYMENT_METHODS[fnIndex].method);
      return;
    }
    switch (e.key) {
      case "F1":
        e.preventDefault();
        searchRef.current?.focus();
        return;
      case "/":
        if (typing) return;
        e.preventDefault();
        searchRef.current?.focus();
        return;
      case "F9":
        e.preventDefault();
        goToCheckout();
        return;
      case "+":
      case "-":
        // Only when not typing a value (an empty search box counts as free)
        if (typingElsewhere || (inSearch && searchHasText) || !last) return;
        e.preventDefault();
        updateQty(last.itemId, last.quantity + (e.key === "+" ? 1 : -1) * quantityStep(last.unitType));
        return;
      case "Delete":
        if (typingElsewhere || (inSearch && searchHasText) || !last) return;
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

  // ── Render ─────────────────────────────────────────────────────────────────

  const dismissLastSale = useCallback(() => setLastSale(null), []);
  const stepBar = (
    <StepBar
      steps={[t("stepProducts"), t("stepPayment"), t("stepDone")]}
      current={STEP_INDEX[step]}
      maxReachable={step === "done" ? 0 : cart.length > 0 ? 1 : 0}
      onSelect={(i) => (i === 0 ? (step === "done" ? nextSale() : backToCart()) : goToCheckout())}
    />
  );
  const priceItem = priceItemId ? cart.find((c) => c.itemId === priceItemId) : undefined;

  return (
    <>
      <div className="relative h-[calc(100vh-6rem)] -m-8 overflow-hidden">
        {step === "checkout" ? (
          <StepCheckout
            header={stepBar}
            cart={cart}
            pricingOf={pricingOf}
            total={total}
            subtotal={subtotal}
            subtotalOverride={subtotalOverride}
            method={method}
            onMethod={chooseMethod}
            tendered={tendered}
            onTendered={setTendered}
            customer={customer}
            onCustomer={setCustomer}
            partialPayment={partialPayment}
            onPartialPayment={setPartialPayment}
            blockers={blockers}
            error={error}
            submitting={submitting}
            onConfirm={confirmSale}
            onBack={backToCart}
            onEditSubtotal={() => setSubtotalOpen(true)}
          />
        ) : step === "done" && lastSale ? (
          <SaleDonePanel sale={lastSale} header={stepBar} onNext={nextSale} />
        ) : (
          <div className="flex h-full">
            <CatalogPanel
              ref={searchRef}
              products={catalog.products}
              loading={catalog.loading}
              categories={categories}
              onAdd={addToCart}
              addByCode={addByCode}
              onQuickCreate={(text, quantity) => setQuickCreate({ text, quantity })}
              onCheckout={() => goToCheckout()}
              scanNotice={scanNotice}
              setScanNotice={setScanNotice}
            />
            <CartRail
              cart={cart}
              pricingOf={pricingOf}
              isRounded={isRounded}
              lastAddedId={lastAddedId}
              total={total}
              subtotal={subtotal}
              subtotalOverride={subtotalOverride}
              header={
                <>
                  {stepBar}
                  {lastSale && (
                    <div className="-mx-3">
                      <SaleDoneBanner sale={lastSale} onDismiss={dismissLastSale} />
                    </div>
                  )}
                </>
              }
              open={mobileCartOpen}
              onClose={() => setMobileCartOpen(false)}
              onClear={() => setCart([])}
              onQuantity={updateQty}
              onEditPrice={(item) => setPriceItemId(item.itemId)}
              onRound={toggleRounding}
              onRemove={removeFromCart}
              onEditSubtotal={() => setSubtotalOpen(true)}
              onClearSubtotal={() => setSubtotalOverride(null)}
              onCheckout={() => goToCheckout()}
            />

            {/* Small screens: the cart lives in a sheet behind this bar */}
            {cart.length > 0 && !mobileCartOpen && (
              <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t bg-white/95 p-3 backdrop-blur md:hidden">
                <button
                  onClick={() => setMobileCartOpen(true)}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-gray-100 px-3 py-3 text-left"
                >
                  <ShoppingCart size={18} className="shrink-0 text-gray-600" />
                  <span className="truncate text-sm font-medium text-gray-700">
                    {t("itemsCount", { count: cart.length })}
                  </span>
                  <span className="ml-auto text-sm font-bold text-gray-900 tabular-nums">{formatCurrency(total)}</span>
                </button>
                <button
                  onClick={() => goToCheckout()}
                  className="flex items-center gap-1.5 rounded-xl bg-green-600 px-4 py-3 text-sm font-bold text-white"
                >
                  {t("stepPayment")}
                  <ArrowRight size={16} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {priceItem && (
        <PriceOverrideDialog
          item={priceItem}
          pricing={pricingOf(priceItem)}
          onApply={(price, reason) => {
            setOverride(priceItem.itemId, price, reason);
            setPriceItemId(null);
          }}
          onReset={() => {
            setOverride(priceItem.itemId, undefined, undefined);
            setPriceItemId(null);
          }}
          onClose={() => setPriceItemId(null)}
        />
      )}

      {subtotalOpen && (
        <SubtotalOverrideDialog
          subtotal={subtotal}
          current={subtotalOverride}
          onApply={(amount, reason) => {
            setSubtotalOverride({ amount, reason });
            setSubtotalOpen(false);
          }}
          onReset={() => {
            setSubtotalOverride(null);
            setSubtotalOpen(false);
          }}
          onClose={() => setSubtotalOpen(false)}
        />
      )}

      {quickCreate && (
        <QuickCreateProduct
          initialText={quickCreate.text}
          catalog={catalog.products}
          categories={categories}
          onClose={() => {
            setQuickCreate(null);
            focusSearch();
          }}
          onReady={(product) => {
            catalog.addLocal(product);
            setQuickCreate(null);
            setScanNotice(null);
            addToCart(product, product.unit_type === "gram" ? null : quickCreate.quantity);
          }}
        />
      )}

      <ProductQuantityModal
        isOpen={!!weighProduct}
        onClose={() => setWeighProduct(null)}
        onConfirm={addToCart}
        itemSelected={weighProduct}
      />
    </>
  );
}
