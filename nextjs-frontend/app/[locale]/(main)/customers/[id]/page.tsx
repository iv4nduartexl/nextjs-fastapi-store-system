import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { fetchCustomer } from "@/components/actions/customers-action";
import CustomerDetailClient from "./CustomerDetailClient";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CustomerDetailPage({ params }: Props) {
  const { id } = await params;
  const locale = await getLocale();

  const result = await fetchCustomer(id);
  if ("message" in result) notFound();

  return <CustomerDetailClient customer={result} locale={locale} />;
}
