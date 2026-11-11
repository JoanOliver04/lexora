import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function DataInformationPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("DataInformation");
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-7 px-4 py-8 sm:px-6 sm:py-12">
      <Link
        href="/app/settings"
        className="inline-flex min-h-11 items-center self-start text-sm text-(--color-accent) underline underline-offset-4"
      >
        {t("back")}
      </Link>
      <header className="flex flex-col gap-3">
        <p className="text-sm font-medium tracking-widest text-(--color-ink-muted)">LEXORA</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t("title")}</h1>
        <p className="max-w-prose leading-relaxed text-(--color-ink-muted)">{t("intro")}</p>
      </header>
      {(["content", "imports", "exports", "deletion", "providers", "limits"] as const).map(
        (key) => (
          <section
            key={key}
            aria-labelledby={`data-${key}`}
            className="flex min-w-0 flex-col gap-3 wrap-anywhere rounded-(--radius-surface) border border-(--color-border) bg-(--color-surface) p-5 sm:p-7"
          >
            <h2 id={`data-${key}`} className="text-xl font-semibold">
              {t(`${key}.title`)}
            </h2>
            <p className="max-w-prose leading-relaxed text-(--color-ink-muted)">
              {t(`${key}.body`)}
            </p>
          </section>
        ),
      )}
    </main>
  );
}
