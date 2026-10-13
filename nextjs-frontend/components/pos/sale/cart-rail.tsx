"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import autoAnimate from "@formkit/auto-animate";
import { ArrowRight, Pencil, ShoppingCart, Trash2, X } from "lucide-react";

import { CartLine } from "@/components/pos/sale/cart-line";
import { formatCurrency } from "@/lib/currency";
import { formatNumber } from "@/lib/format-number";
import { cartCount, type CartItem, type LinePricing } from "@/lib/pos/pricing";

/**
 * Step 1, right side: the cart and one big "Charge" button.
 * On small screens it is a sheet opened from the bottom bar (`open`).
 */
export function CartRail({
  cart,
  pricingOf,
  isRounded,
  lastAddedId,
  total,
  subtotal,
  subtotalOverride,
  header,
  open,
  onClose,
  onClear,
  onQuantity,
  onEditPrice,
  onRound,
  onRemove,
  onEditSubtotal,
  onClearSubtotal,
  onCheckout,
}: {
  cart: CartItem[];
  pricingOf: (item: CartItem) => LinePricing;
  isRounded: (item: CartItem) => boolean;
  lastAddedId: string | null;
  /** What will be charged (the override when there is one) */
  total: number;
  /** Sum of the lines */
  subtotal: number;
  subtotalOverride: { amount: number; reason: string } | null;
  /** Step bar + last sale banner */
  header: React.ReactNode;
  open: boolean;
  onClose: () => void;
  onClear: () => void;
  onQuantity: (itemId: string, quantity: number) => void;
  onEditPrice: (item: CartItem) => void;
  onRound: (itemId: string) => void;
  onRemove: (itemId: string) => void;
  onEditSubtotal: () => void;
  onClearSubtotal: () => void;
  onCheckout: () => void;
}) {
  const t = useTranslations("sales.pos");
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (listRef.current) autoAnimate(listRef.current, { duration: 150 });
  }, []);

  const count = cartCount(cart);

  return (
    <aside
      className={`${
        open ? "fixed inset-0 z-40 flex" : "hidden"
      } md:static md:z-auto md:flex w-full md:w-[23rem] lg:w-[25rem] shrink-0 flex-col border-l bg-gray-50/60 overflow-hidden`}
    >
      <div className="bg-white px-4 pt-3 pb-1">{header}</div>

      {/* Cart header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b">
        <div className="flex items-center gap-2">
          <ShoppingCart size={18} className="text-gray-600" />
          <h3 className="font-semibold text-gray-800">{t("cart")}</h3>
          {cart.length > 0 && (
            <span className="bg-green-100 text-green-700 text-xs font-bold px-1.5 py-0.5 rounded-full leading-none tabular-nums">
              {formatNumber(count)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {cart.length > 0 && (
            <button
              onClick={onClear}
              className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 font-medium transition-colors"
            >
              <Trash2 size={12} />
              {t("clearCart")}
            </button>
          )}
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 md:hidden" aria-label={t("dismiss")}>
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Lines */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-gray-400">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm">
              <ShoppingCart size={24} className="text-gray-300" />
            </div>
            <p className="text-sm text-center max-w-[14rem]">{t("emptyCart")}</p>
          </div>
        ) : (
          cart.map((item) => (
            <CartLine
              key={item.itemId}
              item={item}
              pricing={pricingOf(item)}
              rounded={isRounded(item)}
              flash={lastAddedId === item.itemId}
              onQuantity={(q) => onQuantity(item.itemId, q)}
              onEditPrice={() => onEditPrice(item)}
              onRound={() => onRound(item.itemId)}
              onRemove={() => onRemove(item.itemId)}
            />
          ))
        )}
      </div>

      {/* Total + charge */}
      <div className="border-t bg-white px-4 pt-3 pb-4 space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-500">
                {cart.length > 0 ? t("itemsCount", { count: cart.length }) : t("subtotal")}
              </span>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={onEditSubtotal}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-gray-500 hover:bg-blue-50 hover:text-blue-600"
                >
                  <Pencil size={11} />
                  {t("editSubtotal")}
                </button>
              )}
            </div>
            {subtotalOverride && (
              <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-blue-700">
                <span className="truncate">{t("adjustedTotal", { reason: subtotalOverride.reason })}</span>
                <span className="text-gray-400 line-through tabular-nums">{formatCurrency(subtotal)}</span>
                <button onClick={onClearSubtotal} className="font-semibold text-red-500 hover:text-red-600">
                  {t("resetPrice")}
                </button>
              </p>
            )}
          </div>
          <span className="text-3xl font-black tracking-tight text-gray-900 tabular-nums">{formatCurrency(total)}</span>
        </div>

        <button
          onClick={onCheckout}
          disabled={cart.length === 0}
          className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-green-600 py-4 text-base font-bold text-white shadow-lg shadow-green-600/20 transition-all hover:bg-green-700 active:scale-[0.98] disabled:bg-gray-100 disabled:text-gray-400 disabled:shadow-none"
        >
          {t("charge", { total: formatCurrency(total) })}
          <ArrowRight size={18} className="transition-transform group-enabled:group-hover:translate-x-0.5" />
          <kbd className="ml-1 hidden md:inline rounded border border-current/30 px-1.5 font-mono text-[10px] font-medium opacity-80">
            F9
          </kbd>
        </button>
      </div>
    </aside>
  );
}
