import { getLocale } from "next-intl/server";
import {
  fetchCurrentSession,
  fetchTransactions,
  fetchSessions,
} from "@/components/actions/cashbox-action";
import CashboxDashboard from "./CashboxDashboard";

interface CashboxPageProps {
  searchParams: Promise<{
    page?: string;
    size?: string;
    filter?: string;
    filter_date?: string;
  }>;
}

export default async function CashboxPage({ searchParams }: CashboxPageProps) {
  const locale = await getLocale();
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const size = Number(params.size) || 20;
  const filter = params.filter || "all";
  const filterDate = params.filter_date || "";

  const [session, sessionData] = await Promise.all([
    fetchCurrentSession(),
    fetchSessions(page, size, filter, filterDate || undefined),
  ]);

  const transactions = session ? await fetchTransactions(session.id, 100) : [];

  return (
    <CashboxDashboard
      initialSession={session}
      initialTransactions={transactions}
      sessionsData={sessionData}
      locale={locale}
      initialFilter={filter}
      initialFilterDate={filterDate}
    />
  );
}
