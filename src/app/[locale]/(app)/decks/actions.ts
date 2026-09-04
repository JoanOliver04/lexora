"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getActiveCourseForCurrentUser } from "@/composition/courses";
import { getLibraryContextForCurrentUser } from "@/composition/library";
import { routing } from "@/i18n/routing";
import {
  addConceptToDeck,
  archiveDeck,
  createDeck,
  listDecks,
  removeConceptFromDeck,
  reorderDecks,
  restoreDeck,
  updateDeck,
} from "@/modules/library/application/deck";
import { LibraryError } from "@/modules/library/application/library-error";
import type { DeckIssue } from "@/modules/library/domain/deck";

/**
 * Server Actions de mazos. Delgadas (ADR-001): leen el formulario, resuelven la
 * identidad y el curso activo desde la composición, llaman al caso de uso y
 * devuelven **claves de error estables** (`DeckIssue`) que el componente
 * traduce. La validación real es del dominio (`validateDeckDraft`).
 *
 * `LibraryError` (adaptador) se colapsa a `error: "generic"`: para mazos hoy no
 * hay `duplicate`, y `parent-missing` / `forbidden` no deberían ocurrir porque
 * el caso de uso ya trabaja bajo la identidad del usuario. Se registra y se
 * muestra un mensaje genérico.
 *
 * Cada mutación revalida `/{locale}/decks` antes de redirigir: `force-dynamic`
 * gobierna el render del servidor, no la caché del router en el cliente.
 */

export interface DeckFormState {
  issues?: DeckIssue[];
  error?: "generic";
}

function safeLocale(formData: FormData): string {
  const raw = String(formData.get("locale") ?? "");
  return routing.locales.includes(raw as (typeof routing.locales)[number])
    ? raw
    : routing.defaultLocale;
}

function draftFromForm(formData: FormData): unknown {
  // Se pasan los valores en crudo: el dominio trata `""` como ausente
  // (`readOptionalText` / `readOptionalEnum`) y normaliza el título.
  return {
    title: formData.get("title"),
    description: formData.get("description"),
    cefrLevel: formData.get("cefrLevel"),
    category: formData.get("category"),
  };
}

async function decksContext() {
  const [context, course] = await Promise.all([
    getLibraryContextForCurrentUser(),
    getActiveCourseForCurrentUser(),
  ]);
  return context && course ? { context, course } : null;
}

export async function createDeckAction(
  _prev: DeckFormState,
  formData: FormData,
): Promise<DeckFormState> {
  const locale = safeLocale(formData);
  const scope = await decksContext();
  if (!scope) {
    return { error: "generic" };
  }

  try {
    const outcome = await createDeck(
      scope.context.decks,
      scope.context.ownerId,
      scope.course.id,
      draftFromForm(formData),
    );
    if (!outcome.ok) {
      return { issues: outcome.issues };
    }
  } catch (error) {
    if (error instanceof LibraryError) {
      console.error("createDeckAction", error);
      return { error: "generic" };
    }
    throw error;
  }

  revalidatePath(`/${locale}/decks`);
  redirect(`/${locale}/decks`);
}

export async function updateDeckAction(
  _prev: DeckFormState,
  formData: FormData,
): Promise<DeckFormState> {
  const locale = safeLocale(formData);
  const deckId = String(formData.get("deckId") ?? "");
  const scope = await decksContext();
  if (!scope || deckId === "") {
    return { error: "generic" };
  }

  try {
    const outcome = await updateDeck(
      scope.context.decks,
      scope.context.ownerId,
      deckId,
      draftFromForm(formData),
    );
    if (!outcome.ok) {
      return { issues: outcome.issues };
    }
  } catch (error) {
    if (error instanceof LibraryError) {
      console.error("updateDeckAction", error);
      return { error: "generic" };
    }
    throw error;
  }

  revalidatePath(`/${locale}/decks`);
  revalidatePath(`/${locale}/decks/${deckId}`);
  redirect(`/${locale}/decks`);
}

export async function setDeckArchivedAction(formData: FormData): Promise<void> {
  const locale = safeLocale(formData);
  const deckId = String(formData.get("deckId") ?? "");
  const archived = String(formData.get("archived") ?? "") === "1";
  const scope = await decksContext();
  if (!scope || deckId === "") {
    redirect(`/${locale}/decks`);
  }

  const run = archived ? archiveDeck : restoreDeck;
  await run(scope.context.decks, scope.context.ownerId, deckId);

  revalidatePath(`/${locale}/decks`);
  redirect(`/${locale}/decks`);
}

/**
 * Vincula un concepto ya existente a este mazo. Vive en `decks/actions.ts` (no
 * en `concepts/actions.ts`): la pantalla que la usa es el detalle del mazo
 * (`decks/[deckId]/page.tsx`), LEX-3.6 §2 lo declara así porque
 * `DeckRepository` no tiene una consulta inversa «mazos de un concepto».
 */
export async function linkConceptToDeckAction(formData: FormData): Promise<void> {
  const locale = safeLocale(formData);
  const deckId = String(formData.get("deckId") ?? "");
  const conceptId = String(formData.get("conceptId") ?? "");
  const scope = await decksContext();
  if (!scope || deckId === "" || conceptId === "") {
    redirect(`/${locale}/decks`);
  }

  await addConceptToDeck(scope.context.decks, scope.context.ownerId, { deckId, conceptId });

  revalidatePath(`/${locale}/decks`);
  revalidatePath(`/${locale}/decks/${deckId}`);
  redirect(`/${locale}/decks/${deckId}`);
}

export async function unlinkConceptFromDeckAction(formData: FormData): Promise<void> {
  const locale = safeLocale(formData);
  const deckId = String(formData.get("deckId") ?? "");
  const conceptId = String(formData.get("conceptId") ?? "");
  const scope = await decksContext();
  if (!scope || deckId === "" || conceptId === "") {
    redirect(`/${locale}/decks`);
  }

  await removeConceptFromDeck(scope.context.decks, scope.context.ownerId, { deckId, conceptId });

  revalidatePath(`/${locale}/decks`);
  revalidatePath(`/${locale}/decks/${deckId}`);
  redirect(`/${locale}/decks/${deckId}`);
}

export async function moveDeckAction(formData: FormData): Promise<void> {
  const locale = safeLocale(formData);
  const deckId = String(formData.get("deckId") ?? "");
  const direction = String(formData.get("direction") ?? "");
  const scope = await decksContext();
  if (!scope || deckId === "" || (direction !== "up" && direction !== "down")) {
    redirect(`/${locale}/decks`);
  }

  const decks = await listDecks(scope.context.decks, scope.context.ownerId, scope.course.id);
  const order = decks.map((deck) => deck.id);
  const from = order.indexOf(deckId);
  const to = direction === "up" ? from - 1 : from + 1;

  if (from !== -1 && to >= 0 && to < order.length) {
    const [moved] = order.splice(from, 1);
    if (moved !== undefined) {
      order.splice(to, 0, moved);
      await reorderDecks(scope.context.decks, scope.context.ownerId, scope.course.id, order);
    }
  }

  revalidatePath(`/${locale}/decks`);
  redirect(`/${locale}/decks`);
}
