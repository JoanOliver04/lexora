import type {
  PracticeItemContent,
  PracticeItemPromptContent,
} from "@/modules/library/application/practice-item-content";

/** Stateless content renderer shared by library preview and study. Text only. */
export function PracticeItemPrompt({
  content,
  hintLabel,
}: {
  content: PracticeItemPromptContent;
  hintLabel: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="whitespace-pre-wrap break-words text-lg leading-relaxed [overflow-wrap:anywhere]">
        {content.promptText}
      </p>
      {content.hintText ? (
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-(--color-ink-muted) [overflow-wrap:anywhere]">
          {hintLabel}: {content.hintText}
        </p>
      ) : null}
    </div>
  );
}

export function PracticeItemAnswer({
  content,
  clozeAnswersLabel,
}: {
  content: PracticeItemContent;
  clozeAnswersLabel: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="whitespace-pre-wrap break-words text-base leading-relaxed [overflow-wrap:anywhere]">
        {content.answerText}
      </p>
      {content.mode === "cloze" ? (
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm text-(--color-ink-muted)">{clozeAnswersLabel}</p>
          <ol className="list-inside list-decimal space-y-1 text-sm">
            {content.clozeAnswers.map((answer, index) => (
              <li key={index} className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                {answer}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
