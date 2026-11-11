"use server";

import { getActiveCourseForCurrentUser } from "@/composition/courses";
import { getLibraryContextForCurrentUser } from "@/composition/library";
import {
  deckOptionQuerySchema,
  readDeckOptions,
  type DeckOptions,
} from "@/modules/library/application/library-options";

export async function searchImportDeckOptions(
  raw: unknown,
): Promise<{ ok: true; page: DeckOptions } | { ok: false }> {
  const query = deckOptionQuerySchema.safeParse(raw);
  if (!query.success) return { ok: false };
  try {
    const course = await getActiveCourseForCurrentUser();
    const context = await getLibraryContextForCurrentUser();
    if (!course || !context) return { ok: false };
    const page = await readDeckOptions(context.options, {
      ownerId: context.ownerId,
      courseId: course.id,
      ...query.data,
    });
    return { ok: true, page };
  } catch {
    return { ok: false };
  }
}
