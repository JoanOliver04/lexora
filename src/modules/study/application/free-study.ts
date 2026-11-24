import type { PracticeItemContent } from "@/modules/library/application/practice-item-content";

export const FREE_STUDY_BATCH_SIZE = 12;
export const FREE_STUDY_LENGTHS = ["continuous", "five", "ten", "once"] as const;
export type FreeStudyLength = (typeof FREE_STUDY_LENGTHS)[number];

export interface FreeStudyCard {
  id: string;
  content: PracticeItemContent;
}
