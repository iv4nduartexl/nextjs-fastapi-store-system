import { requireOwnerPage } from "@/lib/session";

// Statistics are owner-only (the API returns 403 to cashiers)
export default async function StatisticsLayout({ children }: { children: React.ReactNode }) {
  await requireOwnerPage();
  return children;
}
