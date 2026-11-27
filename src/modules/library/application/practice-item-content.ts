import {
  type PracticeItem,
  validatePracticeItemDraft,
} from "@/modules/library/domain/practice-item";

import {
  exerciseContent,
  type EoiFront,
  type EoiSolution,
  type SourceContent,
} from "../domain/eoi";
import type { PracticeMode } from "../domain/taxonomy";
export type V1PracticeMode = "basic_recognition" | "basic_recall" | "cloze";
export interface PracticeItemPromptContent {
  mode: PracticeMode;
  exercise?: EoiFront;
  promptText: string;
  hintText: string | null;
}
export type PracticeItemContent = PracticeItemPromptContent & {
  answerText: string;
  clozeAnswers: string[];
  solution?: EoiSolution;
};

/** Validate persisted content without interpreting HTML or inventing cloze markers. */
export function practiceItemContentFrom(
  item: Pick<PracticeItem, "mode" | "promptText" | "answerText" | "hintText" | "config">,
  source?: SourceContent,
): PracticeItemContent | null {
  if (item.config?.exercise && item.config.mode === item.mode) {
    return {
      mode: item.mode,
      promptText: item.promptText,
      answerText: item.answerText,
      hintText: item.hintText,
      clozeAnswers: [],
      ...exerciseContent(item.config.exercise, source),
    };
  }
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
  return {
    mode: content.mode,
    promptText: content.promptText,
    hintText: content.hintText,
    ...(content.exercise ? { exercise: content.exercise } : {}),
  };
}
