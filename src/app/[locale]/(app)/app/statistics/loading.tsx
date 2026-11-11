import { getTranslations } from "next-intl/server";
export default async function StatisticsLoading() {
  const t = await getTranslations("Statistics");
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-4 py-12">
      <h1 className="text-3xl font-semibold">{t("title")}</h1>
      <p role="status">{t("loading")}</p>
    </main>
  );
}
