import { getTranslations } from "next-intl/server";

export default async function DashboardPage() {
  const t = await getTranslations("dashboard");

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <h2 className="text-3xl font-semibold mb-4">{t("title")}</h2>
      <p className="text-lg text-gray-500">{t("subtitle")}</p>
    </div>
  );
}
