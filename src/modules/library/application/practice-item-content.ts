import {
  type PracticeItem,
  validatePracticeItemDraft,
} from "@/modules/library/domain/practice-item";

export type V1PracticeMode = "basic_recognition" | "basic_recall" | "cloze";
export interface PracticeItemPromptContent {
  mode: V1PracticeMode;
  promptText: string;
  hintText: string | null;
}
export type PracticeItemContent = PracticeItemPromptContent & {
  answerText: string;
  clozeAnswers: string[];
};

/** Validate persisted content without interpreting HTML or inventing cloze markers. */
export function practiceItemContentFrom(
  item: Pick<PracticeItem, "mode" | "promptText" | "answerText" | "hintText" | "config">,
): PracticeItemContent | null {
  const result = validatePracticeItemDraft(item);
  if (!result.ok) return null;
  const mode = result.value.mode;
  if (mode !== "basic_recognition" && mode !== "basic_recall" && mode !== "cloze") return null;
  return {
    mode,
    promptText: item.promptText,
    hintText: item.hintText,
    answerText: item.answerText,
    clozeAnswers: result.value.config.mode === "cloze" ? result.value.config.answers : [],
  };
}

/** Explicit allowlist: answers must not enter the unrevealed session payload. */
export function practiceItemPromptFrom(content: PracticeItemContent): PracticeItemPromptContent {
  return { mode: content.mode, promptText: content.promptText, hintText: content.hintText };
}
