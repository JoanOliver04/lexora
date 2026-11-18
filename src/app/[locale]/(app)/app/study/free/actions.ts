"use server";

import { z } from "zod";

import { getFreeStudyContextForCurrentUser } from "@/composition/study";
import { FREE_STUDY_BATCH_SIZE } from "@/modules/study/application/free-study";

const deckSelection = z.array(z.uuid()).nonempty().nullable();
const cardBatch = z.array(z.uuid()).min(1).max(FREE_STUDY_BATCH_SIZE);

export async function loadFreeStudyPool(courseId: string, selection: unknown) {
  const parsed = deckSelection.safeParse(selection);
  if (!parsed.success) return { ok: false } as const;
  const context = await getFreeStudyContextForCurrentUser();
  if (!context || context.courseId !== courseId) return { ok: false } as const;
  return { ok: true, ids: await context.listItemIds(parsed.data) } as const;
}

export async function loadFreeStudyCards(courseId: string, selection: unknown) {
  const parsed = cardBatch.safeParse(selection);
  if (!parsed.success) return { ok: false } as const;
  const context = await getFreeStudyContextForCurrentUser();
  if (!context || context.courseId !== courseId) return { ok: false } as const;
  return { ok: true, cards: await context.readCards(parsed.data) } as const;
}
