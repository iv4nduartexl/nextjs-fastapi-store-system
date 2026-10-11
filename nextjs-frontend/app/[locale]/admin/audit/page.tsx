import { getLocale, getTranslations } from "next-intl/server";

import { listAuditLogs, listBusinesses } from "@/components/actions/admin-action";
import { Link } from "@/i18n/routing";
import LocalDateSpan from "@/lib/LocalDateSpan";

const ACTIONS = [
  "business_created",
  "business_updated",
  "user_created",
  "user_updated",
  "password_reset",
  "password_changed",
  "impersonation_started",
  "impersonation_stopped",
  "impersonated_write",
  "sale_cancelled",
  "purchase_cancelled",
];

interface Props {
  searchParams: Promise<{ page?: string; business_id?: string; action?: string }>;
}

export default async function AdminAuditPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const [logs, businesses, locale, t] = await Promise.all([
    listAuditLogs({ page, business_id: params.business_id, action: params.action }),
    listBusinesses(),
    getLocale(),
    getTranslations("admin"),
  ]);
  const data = logs.data ?? { items: [], total: 0, page: 1, size: 50 };
  const pages = Math.max(1, Math.ceil(data.total / data.size));

  function hrefFor(overrides: Record<string, string | undefined>) {
    const query = new URLSearchParams();
    const merged = { business_id: params.business_id, action: params.action, page: String(page), ...overrides };
    for (const [key, value] of Object.entries(merged)) if (value) query.set(key, value);
    return `/admin/audit?${query.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t("audit.title")}</h1>
        <p className="text-sm text-gray-500">{t("audit.subtitle")}</p>
      </div>

      <form className="flex flex-wrap items-end gap-3" action={`/${locale}/admin/audit`}>
        <label className="space-y-1 text-xs font-medium text-gray-500">
          <span className="block">{t("audit.business")}</span>
          <select name="business_id" defaultValue={params.business_id ?? ""} className="rounded-md border bg-white px-2 py-1.5 text-sm text-gray-800">
            <option value="">{t("audit.all")}</option>
            {(businesses.data ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-gray-500">
          <span className="block">{t("audit.action")}</span>
          <select name="action" defaultValue={params.action ?? ""} className="rounded-md border bg-white px-2 py-1.5 text-sm text-gray-800">
            <option value="">{t("audit.all")}</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {t(`audit.actions.${a}`)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800">
          {t("audit.filter")}
        </button>
      </form>

      <div className="overflow-x-auto rounded-2xl border bg-white">
        {data.items.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400">{t("audit.empty")}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">{t("audit.when")}</th>
                <th className="px-4 py-3 font-medium">{t("audit.action")}</th>
                <th className="px-4 py-3 font-medium">{t("audit.who")}</th>
                <th className="px-4 py-3 font-medium">{t("audit.business")}</th>
                <th className="px-4 py-3 font-medium">{t("audit.details")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.items.map((entry) => (
                <tr key={entry.id} className="align-top">
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                    <LocalDateSpan
                      dateIso={entry.created_at}
                      locale={locale}
                      options={{ day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" }}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                      {ACTIONS.includes(entry.action) ? t(`audit.actions.${entry.action}`) : entry.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-800">
                    {entry.actor_name ?? "—"}
                    {entry.impersonator_name && (
                      <span className="block text-xs text-amber-700">{t("audit.via", { name: entry.impersonator_name })}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {entry.business_id ? (
                      <Link href={`/admin/businesses/${entry.business_id}`} className="text-gray-700 hover:underline">
                        {entry.business_name}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="max-w-xs px-4 py-3 text-xs text-gray-500">
                    {entry.target_type === "request" ? (
                      <code className="break-all">{entry.target_id}</code>
                    ) : entry.details ? (
                      <code className="break-all">{JSON.stringify(entry.details)}</code>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>{t("audit.pageOf", { page, pages })}</span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={hrefFor({ page: String(page - 1) })} className="rounded-md border bg-white px-3 py-1.5 hover:bg-gray-50">
                {t("audit.previous")}
              </Link>
            )}
            {page < pages && (
              <Link href={hrefFor({ page: String(page + 1) })} className="rounded-md border bg-white px-3 py-1.5 hover:bg-gray-50">
                {t("audit.next")}
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
