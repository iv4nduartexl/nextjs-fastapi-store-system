"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Ban, HandCoins, Loader2, X } from "lucide-react";

import { cancelPurchase, writeOffSupplierDebt, type NegativeStockItem } from "@/components/actions/purchases-action";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/currency";
import { formatNumber } from "@/lib/format-number";

type Choice = "writeOff" | "cancelPurchase";

interface VoidDebtDialogProps {
  purchaseId: string;
  remaining: number;
  supplierName: string | null;
  onClose: () => void;
  onDone: () => void;
}

/** "Anular" what's owed: either the balance is no longer owed, or the whole purchase is void. */
export function VoidDebtDialog({ purchaseId, remaining, supplierName, onClose, onDone }: VoidDebtDialogProps) {
  const t = useTranslations("purchases.payments.void");
  const [choice, setChoice] = useState<Choice | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [negativeStock, setNegativeStock] = useState<NegativeStockItem[] | null>(null);

  // Only the choice is required; the reason is optional (kept in the history when given)
  const blocked = !choice ? t("errors.choose") : null;

  async function submit(force = false) {
    if (blocked || submitting) return;
    setSubmitting(true);
    setError(null);
    if (choice === "writeOff") {
      const result = await writeOffSupplierDebt(purchaseId, reason.trim() || undefined);
      setSubmitting(false);
      if (result.data) onDone();
      else setError(t("errors.generic"));
      return;
    }
    const result = await cancelPurchase(purchaseId, reason.trim(), force);
    setSubmitting(false);
    if (result.code === "negative_stock" && result.items) setNegativeStock(result.items);
    else if (result.data) onDone();
    else setError(result.error ?? t("errors.generic"));
  }

  const options: { value: Choice; icon: React.ElementType }[] = [
    { value: "writeOff", icon: HandCoins },
    { value: "cancelPurchase", icon: Ban },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="mx-4 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b px-5 py-4">
          <div>
            <h3 className="font-semibold text-gray-900">{t("title")}</h3>
            <p className="text-xs text-gray-500">
              {supplierName && <>{supplierName} · </>}
              {t("owed", { amount: formatCurrency(remaining) })}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label={t("close")}>
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          {negativeStock ? (
            <div className="space-y-3">
              <p className="flex gap-2 text-sm text-amber-800">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                {t("stockWarning")}
              </p>
              <ul className="space-y-1 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm">
                {negativeStock.map((item) => (
                  <li key={item.id}>
                    <span className="font-semibold text-gray-800">{item.name}</span>{" "}
                    <span className="text-xs text-gray-500">
                      {t("stockLine", { stock: formatNumber(item.stock, 3), quantity: formatNumber(item.quantity, 3) })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              <p className="text-sm font-medium text-gray-700">{t("question")}</p>
              <div className="grid gap-2">
                {options.map(({ value, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setChoice(value)}
                    className={`flex gap-3 rounded-xl border-2 p-3 text-left ${
                      choice === value ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white hover:border-gray-400"
                    }`}
                  >
                    <Icon className="mt-0.5 h-5 w-5 shrink-0" />
                    <span>
                      <span className="block text-sm font-semibold">{t(`${value}.label`)}</span>
                      <span className={`block text-xs ${choice === value ? "text-gray-300" : "text-gray-500"}`}>
                        {t(`${value}.hint`, { amount: formatCurrency(remaining) })}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              <div className="space-y-1.5">
                <label htmlFor={`void-reason-${purchaseId}`} className="text-sm font-medium text-gray-700">
                  {t("reason")} <span className="font-normal text-gray-400">({t("optional")})</span>
                </label>
                <textarea
                  id={`void-reason-${purchaseId}`}
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t("reasonPlaceholder")}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900/10"
                />
              </div>
            </>
          )}

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

          <div className="flex items-center justify-end gap-3">
            {blocked && !negativeStock && <p className="min-w-0 flex-1 text-xs text-gray-500">{blocked}</p>}
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              {t("keep")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => submit(negativeStock != null)}
              disabled={!!blocked || submitting}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {negativeStock ? t("forceConfirm") : t("confirm")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
