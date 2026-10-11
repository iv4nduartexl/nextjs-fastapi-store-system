"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Ban, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cancelSale } from "@/components/actions/sales-action";
import {
  cancelPurchase,
  NegativeStockItem,
} from "@/components/actions/purchases-action";
import { useIsOwner } from "@/components/me-provider";
import { useRouter } from "@/i18n/routing";
import { formatNumber } from "@/lib/format-number";

interface CancelRecordButtonProps {
  kind: "sale" | "purchase";
  id: string;
}

export function CancelRecordButton({ kind, id }: CancelRecordButtonProps) {
  const isOwner = useIsOwner();
  const t = useTranslations("cancelRecord");
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [negativeStock, setNegativeStock] = useState<NegativeStockItem[] | null>(
    null,
  );

  function close() {
    if (pending) return;
    setIsOpen(false);
    setReason("");
    setError("");
    setNegativeStock(null);
  }

  async function submit(force: boolean) {
    setPending(true);
    setError("");

    const result =
      kind === "sale"
        ? await cancelSale(id, reason.trim())
        : await cancelPurchase(id, reason.trim(), force);

    setPending(false);

    if (result.code === "negative_stock" && "items" in result && result.items) {
      setNegativeStock(result.items);
      return;
    }
    if (result.code === "already_cancelled") {
      setError(t("alreadyCancelled"));
      router.refresh();
      return;
    }
    if (result.error) {
      setError(result.error);
      return;
    }
    if (!result.data) {
      setError(t("genericError"));
      return;
    }

    setIsOpen(false);
    router.refresh();
  }

  // Cancellations are owner-only (the API enforces it too)
  if (!isOwner) return null;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
      >
        <Ban size={14} />
        {kind === "sale" ? t("saleButton") : t("purchaseButton")}
      </Button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">
                {negativeStock
                  ? t("negativeStockTitle")
                  : kind === "sale"
                    ? t("saleTitle")
                    : t("purchaseTitle")}
              </h3>
              <button
                onClick={close}
                className="text-gray-400 hover:text-gray-600"
                aria-label={t("keep")}
              >
                <X size={16} />
              </button>
            </div>

            <div className="px-5 py-5 space-y-4">
              {negativeStock ? (
                <div className="space-y-3">
                  <p className="flex gap-2 text-sm text-amber-800">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                    {t("negativeStockDescription")}
                  </p>
                  <ul className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 space-y-1.5">
                    {negativeStock.map((item) => (
                      <li key={item.id} className="text-sm">
                        <span className="font-semibold text-gray-800 break-words">
                          {item.name}
                        </span>
                        <span className="block text-xs text-gray-500">
                          {t("negativeStockLine", {
                            stock: formatNumber(item.stock, 3),
                            quantity: formatNumber(item.quantity, 3),
                          })}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-600">
                    {kind === "sale"
                      ? t("saleDescription")
                      : t("purchaseDescription")}
                  </p>
                  <div className="space-y-1.5">
                    <label
                      htmlFor={`cancel-reason-${id}`}
                      className="text-xs font-semibold text-gray-600"
                    >
                      {t("reasonLabel")}
                    </label>
                    <textarea
                      id={`cancel-reason-${id}`}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder={t("reasonPlaceholder")}
                      rows={2}
                      className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  </div>
                </>
              )}

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={close} disabled={pending}>
                  {t("keep")}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => submit(negativeStock !== null)}
                  disabled={pending}
                >
                  {negativeStock ? t("forceConfirm") : t("confirm")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
