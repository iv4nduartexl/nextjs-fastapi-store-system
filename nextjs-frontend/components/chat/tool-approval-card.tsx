"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle, Check, Loader2, ShieldQuestion, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PendingAction } from "@/components/actions/chat-action";
import { formatCurrency } from "@/lib/currency";
import { formatNumber } from "@/lib/format-number";

// Ids and internals that mean nothing to the user
const HIDDEN_FIELDS = new Set([
  "items",
  "id",
  "user_id",
  "item_id",
  "customer_id",
  "supplier_id",
  "session_id",
  "overwrite_previous_value",
]);
const MONEY_FIELDS = new Set([
  "amount",
  "amount_tendered",
  "opening_amount",
  "closing_amount_counted",
  "credit_limit",
  "price",
  "tax",
  "subtotal_override",
  "total_cost_price",
  "sell_price",
]);

interface PreviewLine {
  item_name?: string;
  item_id?: string;
  quantity?: number | string;
  unit_type?: string;
  price?: number;
  total_price?: number;
  total_cost_price?: number | string;
}

interface ToolApprovalCardProps {
  action: PendingAction;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}

export function ToolApprovalCard({
  action,
  busy,
  onApprove,
  onReject,
}: ToolApprovalCardProps) {
  const t = useTranslations("chat");
  const preview = action.preview ?? {};
  const lines = Array.isArray(preview.items)
    ? (preview.items as PreviewLine[])
    : [];

  const title = t.has(`actions.${action.name}`)
    ? t(`actions.${action.name}`)
    : action.name;

  function label(key: string) {
    return t.has(`fields.${key}`) ? t(`fields.${key}`) : key.replace(/_/g, " ");
  }

  function display(key: string, value: unknown): string {
    if (value === null || value === undefined || value === "") return t("empty");
    if (typeof value === "object") {
      const obj = value as Record<string, unknown>;
      return String(obj.name ?? obj.label ?? JSON.stringify(value));
    }
    if (MONEY_FIELDS.has(key)) return formatCurrency(value as string | number);
    const raw = String(value);
    return t.has(`values.${raw.toLowerCase()}`) ? t(`values.${raw.toLowerCase()}`) : raw;
  }

  const fields = Object.entries(preview).filter(
    ([key, value]) => !HIDDEN_FIELDS.has(key) && value !== null && value !== undefined,
  );
  const grandTotal = lines.reduce(
    (sum, line) => sum + (Number(line.total_price ?? line.total_cost_price) || 0),
    0,
  );

  return (
    <div className="mt-1 rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-3 text-sm">
      <div className="flex items-center gap-2">
        <ShieldQuestion size={16} className="text-amber-600 shrink-0" />
        <span className="font-semibold text-gray-800">{title}</span>
        {action.status === "pending" && (
          <span className="ml-auto text-[11px] font-semibold uppercase tracking-wide text-amber-700">
            {t("toolRequest")}
          </span>
        )}
      </div>

      {lines.length > 0 && (
        <table className="w-full text-xs">
          <thead className="text-gray-500">
            <tr>
              <th className="text-left font-medium pb-1">{t("item")}</th>
              <th className="text-right font-medium pb-1">{t("qty")}</th>
              <th className="text-right font-medium pb-1">{t("price")}</th>
              <th className="text-right font-medium pb-1">{t("total")}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => (
              <tr key={idx} className="border-t border-amber-100">
                <td className="py-1 pr-2 break-words">{line.item_name ?? line.item_id}</td>
                <td className="py-1 text-right tabular-nums">
                  {formatNumber(line.quantity, 3)}
                  {line.unit_type === "gram" ? " g" : ""}
                </td>
                <td className="py-1 text-right tabular-nums">
                  {line.price != null ? formatCurrency(line.price) : "—"}
                </td>
                <td className="py-1 text-right tabular-nums">
                  {formatCurrency(line.total_price ?? line.total_cost_price ?? null)}
                </td>
              </tr>
            ))}
          </tbody>
          {lines.length > 1 && (
            <tfoot>
              <tr className="border-t border-amber-200 font-semibold">
                <td colSpan={3} className="pt-1">
                  {t("total")}
                </td>
                <td className="pt-1 text-right tabular-nums">{formatCurrency(grandTotal)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      )}

      {fields.length > 0 && (
        <dl className="space-y-1 text-xs">
          {fields.map(([key, value]) => (
            <div key={key} className="flex justify-between gap-4">
              <dt className="font-medium text-gray-600">{label(key)}</dt>
              <dd className="text-right text-gray-900 break-words min-w-0">
                {display(key, value)}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {action.status === "pending" ? (
        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
            onClick={onApprove}
            disabled={busy}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {t("approve")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 gap-1.5 border-red-200 text-red-600 hover:bg-red-50"
            onClick={onReject}
            disabled={busy}
          >
            <X className="w-4 h-4" /> {t("reject")}
          </Button>
        </div>
      ) : action.status === "approved" && action.result_ok !== false ? (
        <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
          <Check className="w-3.5 h-3.5" /> {t("approved")}
        </p>
      ) : action.status === "approved" ? (
        <p className="flex items-center gap-1.5 text-xs font-medium text-red-600">
          <AlertTriangle className="w-3.5 h-3.5" /> {t("approvedFailed")}
        </p>
      ) : (
        <p className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
          <X className="w-3.5 h-3.5" /> {t("rejected")}
        </p>
      )}
    </div>
  );
}
