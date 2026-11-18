"use server";

import { revalidatePath } from "next/cache";

import { getActiveCourseForCurrentUser } from "@/composition/courses";
import { getLibraryContextForCurrentUser } from "@/composition/library";
import { createDeck } from "@/modules/library/application/deck";
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

export async function createImportDeck(courseId: string, title: FormDataEntryValue | null) {
  const [course, context] = await Promise.all([
    getActiveCourseForCurrentUser(),
    getLibraryContextForCurrentUser(),
  ]);
  if (!course || !context || course.id !== courseId) {
    return { ok: false, error: "deckCreateFailed" } as const;
  }

  const result = await createDeck(context.decks, context.ownerId, course.id, { title });
  if (!result.ok) {
    const error = result.issues.includes("deck.title.empty")
      ? "deckTitleRequired"
      : "deckTitleLong";
    return { ok: false, error } as const;
  }

  revalidatePath("/[locale]/decks", "page");
  return { ok: true, deck: { id: result.deck.id, title: result.deck.title } } as const;
}
