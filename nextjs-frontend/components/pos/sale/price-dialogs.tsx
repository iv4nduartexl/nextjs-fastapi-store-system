"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { DollarSign, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/currency";
import { toSaleUnits, type CartItem, type LinePricing } from "@/lib/pos/pricing";

function Dialog({
  title,
  onClose,
  wide,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  wide?: boolean;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? "max-w-md" : "max-w-sm"} mx-4 overflow-hidden animate-in zoom-in-95`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <DollarSign size={16} className="text-blue-500" />
            <h3 className="font-semibold text-gray-800">{title}</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-5 space-y-4">{children}</div>
        <div className="px-5 py-4 border-t border-gray-100 bg-white">
          <div className="grid grid-cols-3 gap-2">{footer}</div>
        </div>
      </div>
    </div>
  );
}

function ErrorNote({ message }: { message: string }) {
  return message ? <p className="text-red-500 text-xs bg-red-50 rounded-lg px-3 py-2">{message}</p> : null;
}

/** Change one line's price, by line total or per unit, with a required reason. */
export function PriceOverrideDialog({
  item,
  pricing,
  onApply,
  onReset,
  onClose,
}: {
  item: CartItem;
  pricing: LinePricing;
  onApply: (unitPrice: number, reason: string) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("sales.pos");
  const [mode, setMode] = useState<"unit" | "line_total">("line_total");
  const [unitDraft, setUnitDraft] = useState(String(item.manualOverridePrice ?? pricing.effectiveUnitPrice));
  const [lineDraft, setLineDraft] = useState(String(pricing.effectiveSubtotal));
  const [reason, setReason] = useState(item.manualOverrideReason ?? t("priceChangeReason"));
  const [error, setError] = useState("");

  function apply() {
    if (!reason.trim()) {
      setError(t("overrideReasonRequired"));
      return;
    }
    let value = parseFloat(unitDraft);
    if (mode === "line_total") {
      const lineTotal = parseFloat(lineDraft);
      const saleUnits = toSaleUnits(item.quantity, item.unitType);
      if (Number.isNaN(lineTotal) || lineTotal < 0 || saleUnits <= 0) {
        setError(t("invalidOverrideAmount"));
        return;
      }
      value = lineTotal / saleUnits;
    }
    if (Number.isNaN(value) || value < 0) {
      setError(t("invalidOverrideAmount"));
      return;
    }
    onApply(value, reason.trim());
  }

  return (
    <Dialog
      wide
      title={t("priceOverrideTitle")}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} className="h-10 text-sm">
            {t("cancel")}
          </Button>
          <Button type="button" variant="outline" onClick={onReset} className="h-10 text-sm">
            {t("resetPrice")}
          </Button>
          <Button type="button" onClick={apply} className="h-10 text-sm bg-blue-600 hover:bg-blue-700 text-white">
            {t("applyPrice")}
          </Button>
        </>
      }
    >
      <div className="rounded-xl bg-gray-50 px-4 py-3">
        <p className="text-sm font-semibold text-gray-800">{item.name}</p>
        <p className="text-xs text-gray-500 mt-1">
          {t("currentUnitPrice")}: {formatCurrency(pricing.effectiveUnitPrice)}
        </p>
        <p className="text-xs text-gray-500">
          {t("currentLineTotal")}: {formatCurrency(pricing.effectiveSubtotal)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {(["line_total", "unit"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-xl border-2 px-3 py-2 text-xs font-semibold transition-colors ${
              mode === m ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500 hover:border-gray-300"
            }`}
          >
            {t(m === "unit" ? "overrideByUnit" : "overrideByLineTotal")}
          </button>
        ))}
      </div>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-600">
            {t(mode === "unit" ? "newUnitPrice" : "lineTotalPrice")}
          </label>
          <Input
            key={mode}
            autoFocus
            type="number"
            step={mode === "unit" ? "1" : "100"}
            min="0"
            value={mode === "unit" ? unitDraft : lineDraft}
            onChange={(e) => (mode === "unit" ? setUnitDraft : setLineDraft)(e.target.value)}
            onFocus={(e) => e.target.select()}
            className="h-10 text-sm font-mono"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-600">{t("overrideReason")}</label>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("overrideReason")}
            className="h-10 text-sm"
          />
        </div>
        {/* Enter in either field applies */}
        <button type="submit" hidden />
      </form>

      <ErrorNote message={error} />
    </Dialog>
  );
}

/** Replace the whole sale total (e.g. a negotiated price), with a required reason. */
export function SubtotalOverrideDialog({
  subtotal,
  current,
  onApply,
  onReset,
  onClose,
}: {
  subtotal: number;
  current: { amount: number; reason: string } | null;
  onApply: (amount: number, reason: string) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("sales.pos");
  const [amountDraft, setAmountDraft] = useState(String(current?.amount ?? subtotal));
  const [reason, setReason] = useState(current?.reason ?? "");
  const [error, setError] = useState("");

  function apply() {
    const amount = parseFloat(amountDraft);
    if (Number.isNaN(amount) || amount < 0) {
      setError(t("invalidOverrideAmount"));
      return;
    }
    if (!reason.trim()) {
      setError(t("overrideReasonRequired"));
      return;
    }
    onApply(amount, reason.trim());
  }

  return (
    <Dialog
      title={t("subtotalOverrideTitle")}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} className="h-10 text-sm">
            {t("cancel")}
          </Button>
          <Button type="button" variant="outline" onClick={onReset} className="h-10 text-sm">
            {t("resetPrice")}
          </Button>
          <Button type="button" onClick={apply} className="h-10 text-sm bg-blue-600 hover:bg-blue-700 text-white">
            {t("applyPrice")}
          </Button>
        </>
      }
    >
      <div className="rounded-xl bg-gray-50 px-4 py-3">
        <p className="text-xs text-gray-500">{t("currentSubtotal")}</p>
        <p className="text-2xl font-black text-gray-800 font-mono">{formatCurrency(subtotal)}</p>
      </div>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-600">{t("overrideSubtotal")}</label>
          <Input
            autoFocus
            type="number"
            min="0"
            step="0.01"
            value={amountDraft}
            onChange={(e) => setAmountDraft(e.target.value)}
            onFocus={(e) => e.target.select()}
            placeholder={t("overrideSubtotalPlaceholder")}
            className="h-10 text-sm font-mono"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-600">{t("overrideReason")}</label>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("overrideReason")}
            className="h-10 text-sm"
          />
        </div>
        <button type="submit" hidden />
      </form>

      <ErrorNote message={error} />
    </Dialog>
  );
}
