import { getLocale } from "next-intl/server";
import {
  fetchCurrentSession,
  fetchTransactions,
  fetchSessions,
} from "@/components/actions/cashbox-action";
import CashboxDashboard from "./CashboxDashboard";

export default async function CashboxPage() {
  const locale = await getLocale();

  const [session, pastSessions] = await Promise.all([
    fetchCurrentSession(),
    fetchSessions(50),
  ]);

  const transactions = session ? await fetchTransactions(session.id, 100) : [];

  // Past sessions excludes the currently open one
  const history = pastSessions.filter((s) => s.status !== "open");

  return (
    <CashboxDashboard
      initialSession={session}
      initialTransactions={transactions}
      pastSessions={history}
      locale={locale}
    />
  );
}
