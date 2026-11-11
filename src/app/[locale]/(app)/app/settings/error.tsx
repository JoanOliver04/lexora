"use client";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/shared/presentation/components";
export default function SettingsError({ retry }: { retry: () => void }) {
  const t = useTranslations("Settings");
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-5 px-4 py-12">
      <h1 className="text-3xl font-semibold">{t("title")}</h1>
      <p role="alert">{t("loadError")}</p>
      <div className="flex flex-wrap items-center gap-5">
        <Button onClick={retry}>{t("retry")}</Button>
        <Link href="/app" className="inline-flex min-h-11 items-center underline">
          {t("back")}
        </Link>
      </div>
    </main>
  );
}
