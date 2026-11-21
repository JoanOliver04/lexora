import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { ThemeToggle } from "@/shared/presentation/theme/theme-toggle";
import { Brand } from "@/shared/presentation/components/brand";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "./locale-switcher";
import { PublicPolicyLinks } from "./public-policy-links";
import { SessionControls } from "./session-controls";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, auth] = await Promise.all([getTranslations("Home"), getTranslations("Auth")]);
  const promptLocale = locale === "es" ? "en" : "es";
  return (
    <div className="home-shell">
      <header className="home-header">
        <Brand />
        <div className="home-controls">
          <LocaleSwitcher />
          <ThemeToggle />
        </div>
      </header>
      <main>
        <section className="home-hero" aria-labelledby="home-title">
          <div>
            <h1 id="home-title" className="home-heading">
              {t("tagline")}
            </h1>
            <p className="home-description">{t("description")}</p>
            <div className="home-entry">
              <Suspense
                fallback={
                  <Link href="/login" className="home-secondary">
                    {auth("login.submit")}
                  </Link>
                }
              >
                <SessionControls locale={locale} />
              </Suspense>
            </div>
          </div>
          <section className="recall-stage" aria-labelledby="example-title">
            <div className="recall-intro">
              <h2 id="example-title">{t("example.title")}</h2>
              <p>{t("example.instruction")}</p>
            </div>
            <div className="recall-card">
              <p className="recall-card-label">{t("example.language")}</p>
              <p className="recall-word" lang={promptLocale}>
                {t("example.prompt")}
              </p>
              <details className="recall-answer">
                <summary>
                  <span className="recall-show">{t("example.reveal")}</span>
                  <span className="recall-hide">{t("example.hide")}</span>
                </summary>
                <p>{t("example.answer")}</p>
              </details>
            </div>
          </section>
        </section>
        <section className="home-practice" aria-labelledby="practice-title">
          <h2 id="practice-title">{t("practice.title")}</h2>
          <ol className="home-steps">
            {(["organize", "practice", "review"] as const).map((step) => (
              <li key={step}>
                <h3>{t(`practice.${step}.title`)}</h3>
                <p>{t(`practice.${step}.body`)}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>
      <footer className="home-footer">
        <p>{t("credit")}</p>
        <PublicPolicyLinks />
      </footer>
    </div>
  );
}
