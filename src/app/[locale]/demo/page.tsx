import type { Metadata } from "next";
import Image from "next/image";
import { setRequestLocale } from "next-intl/server";
import { Suspense } from "react";

import { createSpacedRepetitionScheduler } from "@/composition/study";
import { Link } from "@/i18n/navigation";
import type { UiLocale } from "@/i18n/routing";
import { V1_SCHEDULER_CONFIG } from "@/modules/study/domain/scheduler-config";
import { publicPageMetadata } from "@/shared/presentation/public-page-metadata";
import { Brand } from "@/shared/presentation/components/brand";
import { ThemeToggle } from "@/shared/presentation/theme/theme-toggle";
import { LocaleSwitcher } from "../locale-switcher";
import { PublicPolicyLinks } from "../public-policy-links";
import { StudioCredit } from "../studio-credit";
import { SessionControls } from "../session-controls";
import station from "../station.webp";
import { demoCopy } from "./demo-copy";
import { DemoPractice } from "./demo-practice";
import styles from "./demo.module.css";

type PageProps = { params: Promise<{ locale: UiLocale }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  return publicPageMetadata(locale, "demo");
}

export default async function DemoPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = demoCopy[locale];
  if (!t) return null;

  // The same fictional clock and fresh card generate all four review options.
  // Only interval lengths enter the browser. Reviewing never calls a server action.
  const now = new Date("2026-01-12T09:30:00Z");
  const scheduler = createSpacedRepetitionScheduler();
  const fresh = scheduler.createInitialState(now, V1_SCHEDULER_CONFIG);
  const intervals = scheduler.preview(fresh, now, V1_SCHEDULER_CONFIG).map(({ rating, state }) => ({
    rating,
    minutes: Math.round((state.dueAt.getTime() - now.getTime()) / 60_000),
  }));

  return (
    <div className={styles["page"]}>
      <header className={styles["header"]}>
        <div className={styles["topBar"]}>
          <Brand />
          <div className={styles["tools"]}>
            <LocaleSwitcher />
          </div>
        </div>
      </header>
      <main className={styles["main"]}>
        <div className={styles["intro"]}>
          <p className={styles["eyebrow"]}>{t.sample}</p>
          <h1>{t.title}</h1>
          <p className={styles["lede"]}>{t.subtitle}</p>
        </div>
        <div className={styles["layout"]}>
          <DemoPractice
            locale={locale}
            intervals={intervals}
            account={
              <Suspense
                fallback={
                  <Link href="/login" className={styles["primary"]}>
                    {locale === "es" ? "Iniciar sesión" : "Sign in"}
                  </Link>
                }
              >
                <SessionControls locale={locale} presentation="completion" />
              </Suspense>
            }
          />
          <aside className={styles["ticket"]} aria-label={t.journey}>
            <div className={styles["photo"]}>
              <Image
                src={station}
                alt=""
                loading="eager"
                fill
                sizes="(min-width: 60rem) 20rem, (min-width: 42rem) 14rem, 100vw"
              />
            </div>
            <div className={styles["ticketRoute"]}>
              <div>
                <span>{t.from}</span>
                <p lang="en">London Victoria</p>
              </div>
              <div>
                <span>{t.to}</span>
                <p lang="en">Brighton</p>
              </div>
            </div>
          </aside>
        </div>
      </main>
      <footer className={styles["footer"]}>
        <StudioCredit />
        <Link href="/" className={styles["back"]}>
          <span aria-hidden="true">←</span> {t.home}
        </Link>
        <PublicPolicyLinks />
        <ThemeToggle />
      </footer>
    </div>
  );
}
