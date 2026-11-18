import { getTranslations, setRequestLocale } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import {
  TutorialSteps,
  tutorialTopics,
  type TutorialTopic,
} from "@/shared/presentation/components/tutorial-guides";

const topics = Object.keys(tutorialTopics) as TutorialTopic[];
const firstSession = ["library", "study", "progress"] as const;
const ratings = ["again", "hard", "good", "easy"] as const;
const textLink =
  "inline-flex min-h-11 items-center font-semibold text-(--color-accent) underline underline-offset-4";

export default async function HelpPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Tutorials");
  const practice = await getTranslations("PracticeCard");

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-7 px-5 py-8 sm:px-8 sm:py-10">
      <header className="flex flex-col gap-3">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{t("title")}</h1>
        <p className="max-w-prose leading-relaxed text-(--color-ink-muted)">{t("intro")}</p>
      </header>

      <section
        aria-labelledby="first-session"
        className="rounded-(--radius-surface) border border-(--color-border) bg-(--color-surface-sunken) p-5 sm:p-7"
      >
        <h2 id="first-session" className="text-2xl font-semibold tracking-tight">
          {t("firstTitle")}
        </h2>
        <ol className="mt-4 grid list-decimal gap-3 ps-5 marker:font-semibold marker:text-(--color-accent) sm:grid-cols-3 sm:gap-7">
          {firstSession.map((topic) => (
            <li key={topic} className="min-w-0 ps-1">
              <a href={`#tutorial-${topic}`} className={textLink}>
                {t(`first.${topic}.label`)}
              </a>
              <p className="text-sm leading-relaxed text-(--color-ink-muted)">
                {t(`first.${topic}.description`)}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <nav
        aria-label={t("topicsLabel")}
        className="flex flex-wrap gap-x-5 gap-y-1 border-b border-(--color-border) pb-3 text-sm"
      >
        {topics.map((topic) => (
          <a key={topic} href={`#tutorial-${topic}`} className={textLink}>
            {t(`topics.${topic}.label`)}
          </a>
        ))}
      </nav>

      {topics.map((topic) => (
        <section
          key={topic}
          aria-labelledby={`tutorial-${topic}`}
          className="min-w-0 rounded-(--radius-surface) border border-(--color-border) bg-(--color-surface) p-5 sm:p-7"
        >
          <h2
            id={`tutorial-${topic}`}
            tabIndex={-1}
            className="scroll-mt-5 text-2xl font-semibold tracking-tight"
          >
            {t(`topics.${topic}.title`)}
          </h2>
          <p className="my-4 max-w-prose leading-relaxed text-(--color-ink-muted)">
            {t(`topics.${topic}.intro`)}
          </p>
          <TutorialSteps topic={topic} />
          {topic === "study" && (
            <section
              aria-labelledby="tutorial-example"
              className="mt-5 rounded-(--radius-surface) bg-(--color-surface-sunken) p-4 sm:p-5"
            >
              <h3 id="tutorial-example" className="text-lg font-semibold">
                {t("example.title")}
              </h3>
              <p className="mt-1 text-sm text-(--color-ink-muted)">{t("example.note")}</p>
              <p className="mt-4 font-medium">{t("example.prompt")}</p>
              <details>
                <summary className="min-h-11 cursor-pointer py-3 font-semibold text-(--color-accent)">
                  {practice("reveal")}
                </summary>
                <p>
                  <span lang="en" className="font-semibold">
                    Borrow
                  </span>
                  {" · "}
                  {t("example.answer")}
                </p>
                <dl className="mt-4 grid gap-3 pb-2 sm:grid-cols-2">
                  {ratings.map((rating) => (
                    <div key={rating}>
                      <dt className="font-semibold">{practice(`ratings.${rating}.label`)}</dt>
                      <dd className="text-sm leading-relaxed text-(--color-ink-muted)">
                        {practice(`ratings.${rating}.description`)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </details>
            </section>
          )}
          <Link href={tutorialTopics[topic].href} className={`mt-3 ${textLink}`}>
            {t(`topics.${topic}.action`)}
          </Link>
        </section>
      ))}
    </main>
  );
}
