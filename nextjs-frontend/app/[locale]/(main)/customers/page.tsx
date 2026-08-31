import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import {
  Users,
  Plus,
  AlertCircle,
  TrendingDown,
  Phone,
  CreditCard,
} from "lucide-react";
import {
  fetchCustomers,
  CustomerPage,
  CustomerRead,
} from "@/components/actions/customers-action";
import { formatCurrency } from "@/lib/currency";
import CustomerSearch from "./CustomerSearch";

interface Props {
  searchParams: Promise<{ page?: string; q?: string }>;
}

export default async function CustomersPage({ searchParams }: Props) {
  const { page: pageStr, q } = await searchParams;
  const page = Math.max(1, parseInt(pageStr ?? "1"));
  const t = await getTranslations("customers");
  const locale = await getLocale();

  const result = await fetchCustomers(page, 20, q);
  if ("message" in result) notFound();
  const data = result as CustomerPage;

  const totalOutstanding = data.items.reduce(
    (s, c) => s + parseFloat(c.balance),
    0,
  );
  const withBalance = data.items.filter(
    (c) => parseFloat(c.balance) > 0,
  ).length;
  const overLimit = data.items.filter(
    (c) =>
      c.credit_limit != null &&
      parseFloat(c.balance) > parseFloat(c.credit_limit),
  ).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
            <Users size={20} className="text-gray-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
            <p className="text-sm text-gray-500">{t("subtitle")}</p>
          </div>
        </div>
        <Link
          href={`/${locale}/customers/new`}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-800 transition-colors"
        >
          <Plus size={16} />
          {t("newCustomer")}
        </Link>
      </div>

      {/* Search bar */}
      <CustomerSearch
        placeholder={t("searchPlaceholder")}
        defaultValue={q ?? ""}
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
            {t("cards.total")}
          </p>
          <p className="text-3xl font-black text-gray-900 mt-1 tabular-nums">
            {data.total}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
            {t("cards.outstanding")}
          </p>
          <p className="text-2xl font-black text-red-600 mt-1 tabular-nums">
            {formatCurrency(totalOutstanding)}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
            {t("cards.withBalance")}
          </p>
          <p className="text-3xl font-black text-amber-600 mt-1 tabular-nums">
            {withBalance}
          </p>
        </div>
        {overLimit > 0 && (
          <div className="bg-red-50 rounded-2xl border border-red-100 shadow-sm p-4">
            <p className="text-[10px] font-semibold text-red-400 uppercase tracking-widest">
              {t("cards.overLimit")}
            </p>
            <p className="text-3xl font-black text-red-600 mt-1 tabular-nums">
              {overLimit}
            </p>
          </div>
        )}
        {overLimit === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
              {t("cards.overLimit")}
            </p>
            <p className="text-3xl font-black text-gray-900 mt-1 tabular-nums">
              0
            </p>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {data.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400">
            <Users size={40} className="text-gray-200" />
            <p className="text-sm">
              {q ? t("noSearchResults") : t("noResults")}
            </p>
            {!q && (
              <Link
                href={`/${locale}/customers/new`}
                className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900 hover:underline"
              >
                <Plus size={14} />
                {t("newCustomer")}
              </Link>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  {t("table.name")}
                </th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider hidden sm:table-cell">
                  {t("table.phone")}
                </th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider hidden md:table-cell">
                  {t("table.idNumber")}
                </th>
                <th className="text-right px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  {t("table.balance")}
                </th>
                <th className="text-right px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider hidden lg:table-cell">
                  {t("table.creditLimit")}
                </th>
                <th className="w-16" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.items.map((customer) => {
                const balance = parseFloat(customer.balance);
                const limit = customer.credit_limit
                  ? parseFloat(customer.credit_limit)
                  : null;
                const isOverLimit = limit !== null && balance > limit;
                const limitPct = limit
                  ? Math.min(100, (balance / limit) * 100)
                  : 0;

                return (
                  <tr
                    key={customer.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0 text-xs font-bold text-gray-500">
                          {customer.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-800">
                            {customer.name}
                          </p>
                          {isOverLimit && (
                            <p className="text-[10px] text-red-500 font-semibold flex items-center gap-0.5">
                              <AlertCircle size={9} />
                              {t("detail.overLimit")}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 hidden sm:table-cell">
                      {customer.phone ? (
                        <span className="flex items-center gap-1 text-gray-600 text-xs">
                          <Phone size={11} />
                          {customer.phone}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">
                          {t("detail.noPhone")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-gray-500 font-mono hidden md:table-cell">
                      {customer.id_number ?? (
                        <span className="text-gray-300">
                          {t("table.unlimited")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex flex-col items-end gap-1">
                        <span
                          className={`font-bold tabular-nums font-mono ${balance > 0 ? "text-red-600" : "text-gray-400"}`}
                        >
                          {formatCurrency(balance)}
                        </span>
                        {limit !== null && (
                          <div className="w-20 h-1 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${isOverLimit ? "bg-red-500" : limitPct > 75 ? "bg-amber-400" : "bg-green-400"}`}
                              style={{ width: `${limitPct}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right hidden lg:table-cell">
                      {customer.credit_limit ? (
                        <span className="text-xs text-gray-500 font-mono tabular-nums">
                          {formatCurrency(customer.credit_limit)}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">
                          {t("table.unlimited")}
                        </span>
                      )}
                    </td>
                    <td className="pr-4 py-3.5 text-right">
                      <Link
                        href={`/${locale}/customers/${customer.id}`}
                        className="text-xs font-semibold text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 px-2.5 py-1.5 rounded-lg transition-colors"
                      >
                        {t("table.view")}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {data.pages > 1 && (
          <div className="flex justify-center gap-2 px-5 py-4 border-t border-gray-100">
            {Array.from({ length: data.pages }, (_, i) => i + 1).map((p) => (
              <Link
                key={p}
                href={`/customers?page=${p}${q ? `&q=${q}` : ""}`}
                className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-semibold transition-colors ${
                  p === page
                    ? "bg-gray-900 text-white"
                    : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                {p}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
