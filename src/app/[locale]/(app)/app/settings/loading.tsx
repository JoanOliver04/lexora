import { getTranslations } from "next-intl/server";
export default async function SettingsLoading() {
  const t = await getTranslations("Settings");
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-5 px-4 py-12">
      <h1 className="text-3xl font-semibold">{t("title")}</h1>
      <p role="status">{t("loading")}</p>
    </main>
  );
}
