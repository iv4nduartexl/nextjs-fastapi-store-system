"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle, Package, Pencil, Sparkles, Tag } from "lucide-react";

import { formatCurrency } from "@/lib/currency";
import { formatNumber } from "@/lib/format-number";
import { draftWarnings, priceChanges, type Warning, type WizardStep } from "@/lib/purchases/checks";
import { linesTotal, purchaseTotal, type DraftAction, type DraftLine, type PurchaseDraft, type PurchasingProduct } from "@/lib/purchases/draft";

interface StepReviewProps {
  draft: PurchaseDraft;
  dispatch: (action: DraftAction) => void;
  catalog: PurchasingProduct[];
  goTo: (step: WizardStep, lineKey?: string) => void;
}

function qty(line: DraftLine): string {
  if (!line.quantity) return "—";
  return line.unitType === "gram" ? `${formatNumber(line.quantity / 1000, 3)} kg` : `×${formatNumber(line.quantity, 3)}`;
}

function EditLink({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline">
      <Pencil className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

export function StepReview({ draft, dispatch, catalog, goTo }: StepReviewProps) {
  const t = useTranslations("purchases.wizard.review");
  const tPay = useTranslations("purchases.wizard.payment");
  const warnings = draftWarnings(draft, catalog);
  const newProducts = draft.lines.filter((l) => l.itemId == null);
  const changes = priceChanges(draft);
  const linked = draft.lines.filter((l) => l.itemId != null && l.quantity);
  const total = purchaseTotal(draft);
  const { kind, method, paidAmount } = draft.payment;

  function warningText(w: Warning): string {
    switch (w.type) {
      case "loss":
        return t("warnings.loss", { name: w.name });
      case "costJump":
        return t("warnings.costJump", { name: w.name, last: formatCurrency(w.last), now: formatCurrency(w.now) });
      case "similarName":
        return t("warnings.similarName", { name: w.name, existing: w.existing });
      case "invoiceMismatch":
        return t(w.difference > 0 ? "warnings.invoiceMissing" : "warnings.invoiceOver", {
          amount: formatCurrency(Math.abs(w.difference)),
        });
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
        <p className="text-sm text-gray-500">{t("subtitle")}</p>
      </header>

      {warnings.length > 0 && (
        <section className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="flex items-center gap-2 font-semibold text-amber-900">
            <AlertTriangle className="h-4 w-4" /> {t("warningsTitle", { count: warnings.length })}
          </p>
          <ul className="space-y-1.5">
            {warnings.map((w, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 text-sm text-amber-900">
                <span>{warningText(w)}</span>
                <button
                  type="button"
                  onClick={() => goTo("products", "lineKey" in w ? w.lineKey : undefined)}
                  className="rounded-md border border-amber-300 bg-white px-2 py-1 text-xs font-medium hover:bg-amber-100"
                >
                  {t("check")}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-2xl border bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-0.5 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{t("supplierTitle")}</p>
            <p className="text-base font-semibold text-gray-900">{draft.supplier?.name ?? t("noSupplier")}</p>
            <p className="text-gray-500">
              {draft.date}
              {draft.invoiceNumber && <> · {t("invoiceNo", { number: draft.invoiceNumber })}</>}
            </p>
          </div>
          <EditLink onClick={() => goTo("supplier")} label={t("edit")} />
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{t("productsTitle", { count: draft.lines.length })}</p>
          <EditLink onClick={() => goTo("products")} label={t("edit")} />
        </div>
        <table className="w-full text-sm">
          <tbody className="divide-y">
            {draft.lines.map((line) => (
              <tr key={line.key}>
                <td className="py-2 pr-2">
                  <span className="font-medium text-gray-900">{line.name}</span>
                  {line.itemId == null && (
                    <span className="ml-1.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">{t("newTag")}</span>
                  )}
                </td>
                <td className="py-2 text-right text-gray-500 tabular-nums">{qty(line)}</td>
                <td className="py-2 pl-3 text-right font-medium tabular-nums">{formatCurrency(line.lineTotal ?? 0)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2">
            {draft.payment.hasTax && (
              <tr>
                <td colSpan={2} className="pt-2 text-gray-500">{t("tax")}</td>
                <td className="pt-2 text-right tabular-nums">{formatCurrency(draft.payment.tax ?? 0)}</td>
              </tr>
            )}
            <tr>
              <td colSpan={2} className="pt-2 text-base font-semibold">{t("total")}</td>
              <td className="pt-2 text-right text-base font-bold tabular-nums">{formatCurrency(total)}</td>
            </tr>
            {draft.invoiceTotal != null && (
              <tr>
                <td colSpan={2} className="text-gray-500">{t("invoiceTotal")}</td>
                <td className="text-right tabular-nums text-gray-500">{formatCurrency(draft.invoiceTotal)}</td>
              </tr>
            )}
          </tfoot>
        </table>
        {linesTotal(draft) === 0 && <p className="mt-2 text-sm text-red-600">{t("emptyTotal")}</p>}
      </section>

      {(newProducts.length > 0 || changes.length > 0 || linked.length > 0) && (
        <section className="space-y-3 rounded-2xl border bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{t("catalogTitle")}</p>
          {newProducts.length > 0 && (
            <div>
              <p className="flex items-center gap-2 text-sm font-medium text-gray-900">
                <Sparkles className="h-4 w-4 text-emerald-600" /> {t("newProducts", { count: newProducts.length })}
              </p>
              <ul className="ml-6 mt-1 space-y-0.5 text-sm text-gray-600">
                {newProducts.map((l) => (
                  <li key={l.key}>
                    {l.name} · {t("sellsAt", { price: formatCurrency(l.sellPrice ?? 0) })}
                    {l.category && <> · {l.category}</>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {changes.length > 0 && (
            <div>
              <p className="flex items-center gap-2 text-sm font-medium text-gray-900">
                <Tag className="h-4 w-4 text-blue-600" /> {t("priceChanges")}
              </p>
              <ul className="ml-6 mt-1 space-y-1 text-sm">
                {changes.map((l) => (
                  <li key={l.key}>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={l.applyPriceChange}
                        onChange={(e) =>
                          dispatch({ type: "updateLine", key: l.key, patch: { applyPriceChange: e.target.checked } })
                        }
                        className="h-4 w-4"
                      />
                      <span className={l.applyPriceChange ? "text-gray-800" : "text-gray-400 line-through"}>
                        {l.name}: {formatCurrency(l.currentPrice ?? 0)} → {formatCurrency(l.sellPrice ?? 0)}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {linked.length > 0 && (
            <div>
              <p className="flex items-center gap-2 text-sm font-medium text-gray-900">
                <Package className="h-4 w-4 text-gray-500" /> {t("stockChanges")}
              </p>
              <ul className="ml-6 mt-1 space-y-0.5 text-sm text-gray-600">
                {linked.map((l) => {
                  const toUnits = (n: number) => (l.unitType === "gram" ? n / 1000 : n);
                  const before = l.currentStock ?? 0;
                  return (
                    <li key={l.key}>
                      {l.name}: {formatNumber(toUnits(before), 3)} → {formatNumber(toUnits(before + (l.quantity ?? 0)), 3)}
                      {l.unitType === "gram" && " kg"}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      )}

      <section className="rounded-2xl border bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{t("paymentTitle")}</p>
            <p className="text-base font-semibold text-gray-900">
              {kind === "later"
                ? tPay("kind.later")
                : kind === "partial"
                  ? t("paidPartial", { amount: formatCurrency(paidAmount ?? 0), method: tPay(`methods.${method}`) })
                  : t("paidAll", { method: tPay(`methods.${method}`) })}
            </p>
            {kind === "partial" && (
              <p className="text-gray-500">{tPay("stillOwed", { amount: formatCurrency(Math.max(0, total - (paidAmount ?? 0))) })}</p>
            )}
          </div>
          <EditLink onClick={() => goTo("payment")} label={t("edit")} />
        </div>
      </section>
    </div>
  );
}
