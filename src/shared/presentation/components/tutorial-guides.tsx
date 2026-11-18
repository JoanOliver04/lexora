import { useTranslations } from "next-intl";

export const tutorialTopics = {
  library: { href: "/decks#new-deck", steps: 4 },
  study: { href: "/app/study", steps: 4 },
  import: { href: "/import", steps: 4 },
  progress: { href: "/app/statistics", steps: 3 },
  preferences: { href: "/app/settings", steps: 3 },
  data: { href: "/app/settings/data", steps: 3 },
} as const;

export type TutorialTopic = keyof typeof tutorialTopics;

export function TutorialSteps({ topic }: { topic: TutorialTopic }) {
  const t = useTranslations("Tutorials");
  return (
    <>
      <ol className="list-decimal space-y-2 ps-6 leading-relaxed marker:font-semibold marker:text-(--color-accent)">
        {Array.from({ length: tutorialTopics[topic].steps }, (_, index) => (
          <li key={index} className="ps-1">
            {t(`topics.${topic}.steps.${index + 1}`)}
          </li>
        ))}
      </ol>
      <p className="mt-4 border-s-2 border-(--color-accent) ps-3 text-sm leading-relaxed text-(--color-ink-muted)">
        {t(`topics.${topic}.tip`)}
      </p>
    </>
  );
}

export function TutorialHint({ topic }: { topic: "study" | "import" }) {
  const t = useTranslations("Tutorials");
  return (
    <details className="rounded-(--radius-surface) border border-(--color-border) bg-(--color-surface) px-4">
      <summary className="min-h-11 cursor-pointer py-3 font-semibold text-(--color-accent)">
        {t(`topics.${topic}.title`)}
      </summary>
      <div className="pb-4 text-sm">
        <TutorialSteps topic={topic} />
      </div>
    </details>
  );
}
