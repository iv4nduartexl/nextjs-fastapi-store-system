import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { fetchSessionById, fetchTransactions } from "@/components/actions/cashbox-action";
import SessionDetailClient from "./SessionDetailClient";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SessionDetailPage({ params }: Props) {
  const { id } = await params;
  const locale = await getLocale();

  const [session, transactions] = await Promise.all([
    fetchSessionById(id),
    fetchTransactions(id, 500),
  ]);

  if (!session) notFound();

  return (
    <SessionDetailClient
      session={session}
      transactions={transactions}
      locale={locale}
    />
  );
}
