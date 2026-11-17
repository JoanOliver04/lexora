import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";
import { ThemeToggle } from "@/shared/presentation/theme/theme-toggle";
import { Brand } from "@/shared/presentation/components/brand";
import { LocaleSwitcher } from "./locale-switcher";
import { SessionControls } from "./session-controls";

export default function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations("Home");
  const v = useTranslations("Visual");
  return (
    <div className="home-shell">
      <header className="home-header">
        <Brand />
        <div className="home-controls">
          <LocaleSwitcher />
          <ThemeToggle />
        </div>
      </header>
      <main className="home-hero">
        <div>
          <h1 className="home-heading">{t("tagline")}</h1>
          <p className="home-description">{t("problem")}</p>
          <div className="home-entry">
            <SessionControls locale={locale} />
          </div>
        </div>
        <div className="recall-stage" aria-hidden="true">
          <div className="recall-card">
            <p className="recall-card-label">{v("cardHint")}</p>
            <p className="recall-word" lang="en">
              a little progress,
              <br />
              every day.
            </p>
            <p className="recall-meaning" lang="es">
              {v("cardMeaning")}
            </p>
            <div className="recall-skills">
              <span>{v("recognise")}</span>
              <span>{v("recall")}</span>
              <span>{v("complete")}</span>
            </div>
          </div>
        </div>
      </main>
      <footer className="home-footer">
        <div>
          <h2 className="font-semibold">{t("statusTitle")}</h2>
          <p>{t("status")}</p>
          <p className="mt-2">{t("approach")}</p>
        </div>
        <a href="https://github.com/JoanOliver04/lexora" rel="noreferrer">
          {t("repository")}
        </a>
      </footer>
    </div>
  );
}
