import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";

import { Link } from "@/i18n/navigation";
import { Brand } from "@/shared/presentation/components/brand";
import {
  WorkspaceIcon,
  workspaceDestinations,
} from "@/shared/presentation/components/workspace-destinations";
import { publicPageMetadata } from "@/shared/presentation/public-page-metadata";
import { ThemeToggle } from "@/shared/presentation/theme/theme-toggle";

import { getLandingCopy } from "./landing-copy";
import styles from "./landing.module.css";
import { LocaleSwitcher } from "./locale-switcher";
import { PublicPolicyLinks } from "./public-policy-links";
import { SessionControls } from "./session-controls";
import station from "./station.webp";

const stepIcons = ["decks", "concepts", "history"] as const;

type HomeProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: HomeProps) {
  const { locale } = await params;
  return publicPageMetadata(locale, "home");
}

export default async function Home({ params }: HomeProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, auth] = await Promise.all([getTranslations("Home"), getTranslations("Auth")]);
  const copy = getLandingCopy(locale);
  const promptLocale = locale === "es" ? "en" : "es";

  return (
    <div className={styles["paper"]}>
      <a className="skip-link" href="#main-content">
        {copy.skip}
      </a>
      <div className={styles["page"]}>
        <header className={styles["header"]}>
          <Brand />
          <div className={styles["headerNav"]}>
            <a className={styles["methodLink"]} href="#method">
              {copy.method}
            </a>
            <div className={styles["language"]}>
              <LocaleSwitcher />
            </div>
            <div className={styles["session"]}>
              <Suspense
                fallback={
                  <Link href="/login" className={styles["account"]}>
                    {auth("login.submit")}
                  </Link>
                }
              >
                <SessionControls locale={locale} />
              </Suspense>
            </div>
          </div>
        </header>

        <main id="main-content">
          <section className={styles["hero"]} aria-labelledby="home-title">
            <div className={styles["intro"]}>
              <p className={styles["category"]}>{copy.category}</p>
              <h1 id="home-title" className={styles["headline"]}>
                {copy.heading[0]} <em>{copy.heading[1]}</em>
              </h1>
              <p className={styles["description"]}>{copy.description}</p>
              <div className={styles["actionRow"]}>
                <Link href="/demo" className={styles["demoLink"]}>
                  {copy.demo}
                  <span aria-hidden="true">→</span>
                </Link>
                <span className={styles["demoTerms"]}>{copy.terms}</span>
              </div>
            </div>

            <figure className={styles["visual"]}>
              <Image
                className={styles["photograph"]}
                src={station}
                alt=""
                loading="eager"
                fetchPriority="high"
                sizes="(min-width: 84rem) 39rem, (min-width: 52rem) 48vw, 92vw"
              />
              <figcaption className={styles["ticket"]}>
                <div className={styles["ticketMain"]}>
                  <span className={styles["ticketLabel"]}>{copy.deck}</span>
                  <span className={styles["destination"]}>
                    <span className="sr-only">{copy.destination} </span>Brighton
                  </span>
                  <span className={styles["origin"]}>{copy.origin}</span>
                </div>
                <div className={styles["stub"]}>
                  <span className={styles["ticketStamp"]}>B1</span>
                  <span>{copy.theme}</span>
                </div>
              </figcaption>
            </figure>
          </section>

          <section id="method" className={styles["method"]} aria-labelledby="method-title">
            <h2 id="method-title" className={styles["sectionTitle"]}>
              {t("practice.title")}
            </h2>
            <ol className={styles["steps"]}>
              {copy.steps.map((step, index) => (
                <li key={step.title}>
                  <div className={styles["icon"]}>
                    <WorkspaceIcon
                      path={
                        workspaceDestinations.find((item) => item.key === stepIcons[index])!.path
                      }
                    />
                  </div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </li>
              ))}
            </ol>
          </section>

          <section className={styles["example"]} aria-labelledby="example-title">
            <div className={styles["exampleIntro"]}>
              <h2 className={styles["sectionTitle"]} id="example-title">
                {t("example.title")}
              </h2>
              <p>{t("example.instruction")}</p>
            </div>
            <div className={styles["flashcard"]}>
              <p className={styles["cardLanguage"]}>{t("example.language")}</p>
              <p className={styles["cardPrompt"]} lang={promptLocale}>
                {t("example.prompt")}
              </p>
              <details className="recall-answer">
                <summary>
                  <span className="recall-show">{t("example.reveal")}</span>
                  <span className="recall-hide">{t("example.hide")}</span>
                </summary>
                <p>{t("example.answer")}</p>
                <Link href="/demo" className={styles["continueLink"]}>
                  {copy.continueDemo}
                  <span aria-hidden="true"> →</span>
                </Link>
              </details>
            </div>
          </section>
        </main>

        <footer className={styles["footer"]}>
          <p>{t("credit")}</p>
          <PublicPolicyLinks />
          <ThemeToggle />
        </footer>
      </div>
    </div>
  );
}
