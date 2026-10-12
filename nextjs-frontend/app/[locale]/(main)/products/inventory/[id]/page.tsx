import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";

import { fetchInventoryCount } from "@/components/actions/inventory-action";
import { Link } from "@/i18n/routing";
import { formatNumber } from "@/lib/format-number";
import { displayDecimals, toDisplay } from "@/lib/inventory/count";
import LocalDateSpan from "@/lib/LocalDateSpan";
import { requireOwnerPage } from "@/lib/session";

export default async function InventoryCountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwnerPage();
  const { id } = await params;
  const [result, locale, t] = await Promise.all([fetchInventoryCount(id), getLocale(), getTranslations("inventory")]);
  const count = result.data;
  if (!count) notFound();

  const lines = [...count.lines].sort((a, b) => {
    const da = Math.abs(parseFloat(a.new_stock) - parseFloat(a.previous_stock));
    const db = Math.abs(parseFloat(b.new_stock) - parseFloat(b.previous_stock));
    return db - da || a.item_name.localeCompare(b.item_name);
  });

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <Link href="/products/inventory" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft className="h-4 w-4" /> {t("detail.back")}
      </Link>
      <header>
        <h1 className="text-2xl font-bold text-gray-900">{count.category ?? t("start.everything")}</h1>
        <p className="text-sm text-gray-500">
          <LocalDateSpan
            dateIso={count.applied_at}
            locale={locale}
            options={{ day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }}
          />
          {count.user_name && <> · {count.user_name}</>} ·{" "}
          {t("history.changes", { changed: count.lines_changed, counted: count.lines_counted })}
        </p>
        {count.notes && <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">{count.notes}</p>}
      </header>

      <div className="overflow-x-auto rounded-2xl border bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2">{t("detail.product")}</th>
              <th className="px-4 py-2 text-right">{t("detail.counted")}</th>
              <th className="px-4 py-2 text-right">{t("detail.before")}</th>
              <th className="px-4 py-2 text-right">{t("detail.after")}</th>
              <th className="px-4 py-2 text-right">{t("detail.difference")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {lines.map((line, i) => {
              const decimals = displayDecimals(line.unit_type);
              const show = (v: string) => formatNumber(toDisplay(parseFloat(v), line.unit_type), decimals);
              const diff = toDisplay(parseFloat(line.new_stock) - parseFloat(line.previous_stock), line.unit_type);
              return (
                <tr key={`${line.item_id}-${i}`}>
                  <td className="px-4 py-2 font-medium text-gray-900">
                    {line.item_name} <span className="text-xs font-normal text-gray-400">{t(`count.unit.${line.unit_type}`)}</span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{show(line.counted)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-500">{show(line.previous_stock)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{show(line.new_stock)}</td>
                  <td
                    className={`px-4 py-2 text-right font-semibold tabular-nums ${
                      diff > 0 ? "text-green-600" : diff < 0 ? "text-red-600" : "text-gray-400"
                    }`}
                  >
                    {diff === 0 ? "—" : `${diff > 0 ? "+" : ""}${formatNumber(diff, decimals)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
