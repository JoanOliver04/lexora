import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";

const updatedOn = "2026-11-21";
const sections = ["service", "account", "materials", "use", "availability"] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Terms" });
  return { title: `${t("title")} | Lexora`, description: t("intro") };
}

export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, privacy, format] = await Promise.all([
    getTranslations("Terms"),
    getTranslations("Privacy"),
    getFormatter(),
  ]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
      <Link
        href="/"
        className="inline-flex min-h-11 items-center self-start text-sm text-(--color-accent) underline underline-offset-4"
      >
        {privacy("back")}
      </Link>
      <header className="space-y-3">
        <p className="text-sm font-medium tracking-widest text-(--color-ink-muted)">JVOR Studios</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t("title")}</h1>
        <p className="max-w-prose leading-relaxed text-(--color-ink-muted)">{t("intro")}</p>
        <p className="text-sm text-(--color-ink-muted)">
          {t.rich("updated", {
            date: () => (
              <time dateTime={updatedOn}>
                {format.dateTime(new Date(updatedOn), { dateStyle: "long", timeZone: "UTC" })}
              </time>
            ),
          })}
        </p>
      </header>
      {sections.map((section) => (
        <section
          key={section}
          aria-labelledby={`terms-${section}`}
          className="space-y-2 rounded-(--radius-surface) border border-(--color-border) bg-(--color-surface) p-5 sm:p-7"
        >
          <h2 id={`terms-${section}`} className="text-xl font-semibold">
            {t(`${section}.title`)}
          </h2>
          <p className="max-w-prose leading-relaxed text-(--color-ink-muted)">
            {t(`${section}.body`)}
          </p>
        </section>
      ))}
      <section aria-labelledby="terms-data" className="space-y-2">
        <h2 id="terms-data" className="text-xl font-semibold">
          {t("data.title")}
        </h2>
        <p className="max-w-prose leading-relaxed text-(--color-ink-muted)">{t("data.body")}</p>
        <Link
          href="/privacy"
          className="inline-flex min-h-11 items-center text-(--color-accent) underline underline-offset-4"
        >
          {t("data.privacy")}
        </Link>
      </section>
    </main>
  );
}
