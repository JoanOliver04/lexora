import type { PracticeItemContent } from "@/modules/library/application/practice-item-content";

export const FREE_STUDY_BATCH_SIZE = 12;

export interface FreeStudyCard {
  id: string;
  content: PracticeItemContent;
}
