import { getTranslations, setRequestLocale } from "next-intl/server";
import { getPrivacyContact } from "@/env/server";
import { Link } from "@/i18n/navigation";
import { StudioCredit } from "../studio-credit";

const sections = ["purpose", "providers", "retention", "rights"] as const;

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Privacy");
  const contact = getPrivacyContact();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
      <Link
        href="/"
        className="inline-flex min-h-11 items-center self-start text-sm text-(--color-accent) underline underline-offset-4"
      >
        {t("back")}
      </Link>
      <header className="space-y-3">
        <p className="text-sm font-medium tracking-widest text-(--color-ink-muted)">JVOR Studios</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t("title")}</h1>
        <p className="max-w-prose leading-relaxed text-(--color-ink-muted)">{t("intro")}</p>
      </header>
      {contact && (
        <section aria-labelledby="privacy-contact" className="space-y-2">
          <h2 id="privacy-contact" className="text-xl font-semibold">
            {t("contact.title")}
          </h2>
          <p className="break-words">{t("contact.controller", { name: contact.name })}</p>
          <a
            href={contact.href}
            className="inline-flex min-h-11 items-center text-(--color-accent) underline underline-offset-4"
          >
            {t("contact.link")}
          </a>
        </section>
      )}
      {sections.map((section) => (
        <section
          key={section}
          aria-labelledby={`privacy-${section}`}
          className="space-y-2 rounded-(--radius-surface) border border-(--color-border) bg-(--color-surface) p-5 sm:p-7"
        >
          <h2 id={`privacy-${section}`} className="text-xl font-semibold">
            {t(`${section}.title`)}
          </h2>
          <p className="max-w-prose leading-relaxed text-(--color-ink-muted)">
            {t(`${section}.body`)}
          </p>
        </section>
      ))}
      <footer>
        <StudioCredit />
      </footer>
    </main>
  );
}
