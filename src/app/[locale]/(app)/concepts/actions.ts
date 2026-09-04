"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getActiveCourseForCurrentUser } from "@/composition/courses";
import { getLibraryContextForCurrentUser } from "@/composition/library";
import { routing } from "@/i18n/routing";
import {
  archiveConcept,
  createConcept,
  findDuplicateConcepts,
  restoreConcept,
  updateConcept,
} from "@/modules/library/application/concept";
import { LibraryError } from "@/modules/library/application/library-error";
import {
  archivePracticeItem,
  createPracticeItem,
  createReversePracticeItem,
  listPracticeItems,
  restorePracticeItem,
  updatePracticeItem,
} from "@/modules/library/application/practice-item";
import { createTag, listTags, tagConcept, untagConcept } from "@/modules/library/application/tag";
import type { ConceptIssue } from "@/modules/library/domain/concept";
import type { PracticeItemIssue } from "@/modules/library/domain/practice-item";
import { normalizeTagName, type TagIssue } from "@/modules/library/domain/tag";

import type { ConceptFieldDefaults } from "./concept-fields";

/**
 * Server Actions de conceptos, de sus etiquetas y de sus ítems de práctica.
 * Delgadas (ADR-001), mismo patrón que `decks/actions.ts`.
 */

/** Coincidencia de posible duplicado, solo lo que la sugerencia necesita mostrar (LEX-3.10). */
export interface ConceptDuplicateMatch {
  id: string;
  title: string;
  kind: string;
}

export interface ConceptFormState {
  issues?: ConceptIssue[];
  error?: "generic";
  duplicates?: ConceptDuplicateMatch[];
  /**
   * Eco de lo que la persona tecleó, para volver a rellenar el formulario
   * cuando no se crea (issues, duplicados o error). React reinicia un
   * `<form>` no controlado a los `defaultValue` tras **cualquier** envío de
   * una Server Action que no navegue — sin esto, el segundo envío («Crear de
   * todos modos») partiría de campos vacíos en vez de lo que la persona ya
   * había escrito.
   */
  values?: ConceptFieldDefaults;
}

export interface TagFormState {
  issues?: TagIssue[];
  error?: "generic";
}

export interface PracticeItemFormState {
  issues?: PracticeItemIssue[];
  error?: "generic";
}

function safeLocale(formData: FormData): string {
  const raw = String(formData.get("locale") ?? "");
  return routing.locales.includes(raw as (typeof routing.locales)[number])
    ? raw
    : routing.defaultLocale;
}

/** Lo tecleado, como texto plano, para re-rellenar el formulario si no se crea. */
function fieldValuesFromForm(formData: FormData): ConceptFieldDefaults {
  const text = (key: string): string => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  return {
    kind: text("kind"),
    title: text("title"),
    summary: text("summary"),
    explanation: text("explanation"),
    example: text("example"),
    cefrLevel: text("cefrLevel"),
    sourceReference: text("sourceReference"),
  };
}

function draftFromForm(formData: FormData): unknown {
  return {
    kind: formData.get("kind"),
    title: formData.get("title"),
    summary: formData.get("summary"),
    explanation: formData.get("explanation"),
    example: formData.get("example"),
    cefrLevel: formData.get("cefrLevel"),
    sourceReference: formData.get("sourceReference"),
  };
}

function practiceItemDraftFromForm(formData: FormData): unknown {
  const mode = formData.get("mode");
  const config =
    mode === "cloze"
      ? { mode: "cloze", answers: String(formData.get("clozeAnswers") ?? "").split("\n") }
      : { mode };
  return {
    mode,
    promptText: formData.get("promptText"),
    answerText: formData.get("answerText"),
    hintText: formData.get("hintText"),
    config,
  };
}

async function libraryScope() {
  const [context, course] = await Promise.all([
    getLibraryContextForCurrentUser(),
    getActiveCourseForCurrentUser(),
  ]);
  return context && course ? { context, course } : null;
}

/**
 * Sugerencia de duplicados (LEX-3.10): antes de crear, si el título normaliza
 * a la misma `canonicalKey` que un concepto vivo del curso, se enseña la
 * coincidencia y **no** se crea todavía. `confirmDuplicate` llega a `"1"`
 * cuando el propio formulario ya estaba mostrando el aviso en el envío
 * anterior (campo oculto que refleja `duplicates.length > 0` en el cliente,
 * ver `create-concept-form.tsx`) — reenviar tras verlo cuenta como decisión
 * de la persona, sin JavaScript. Nunca fusiona ni sobrescribe: el concepto
 * nuevo se crea igual que si no hubiera coincidencia, la clave no es única.
 */
export async function createConceptAction(
  _prev: ConceptFormState,
  formData: FormData,
): Promise<ConceptFormState> {
  const locale = safeLocale(formData);
  const scope = await libraryScope();
  if (!scope) {
    return { error: "generic" };
  }

  const confirmDuplicate = formData.get("confirmDuplicate") === "1";
  const rawTitle = formData.get("title");
  if (!confirmDuplicate && typeof rawTitle === "string") {
    const duplicates = await findDuplicateConcepts(
      scope.context.concepts,
      scope.context.ownerId,
      scope.course.id,
      rawTitle,
    );
    if (duplicates.length > 0) {
      return {
        duplicates: duplicates.map((concept) => ({
          id: concept.id,
          title: concept.title,
          kind: concept.kind,
        })),
        values: fieldValuesFromForm(formData),
      };
    }
  }

  try {
    const outcome = await createConcept(
      scope.context.concepts,
      scope.context.ownerId,
      scope.course.id,
      draftFromForm(formData),
    );
    if (!outcome.ok) {
      return { issues: outcome.issues, values: fieldValuesFromForm(formData) };
    }
  } catch (error) {
    if (error instanceof LibraryError) {
      console.error("createConceptAction", error);
      return { error: "generic", values: fieldValuesFromForm(formData) };
    }
    throw error;
  }

  revalidatePath(`/${locale}/concepts`);
  redirect(`/${locale}/concepts`);
}

export async function updateConceptAction(
  _prev: ConceptFormState,
  formData: FormData,
): Promise<ConceptFormState> {
  const locale = safeLocale(formData);
  const conceptId = String(formData.get("conceptId") ?? "");
  const scope = await libraryScope();
  if (!scope || conceptId === "") {
    return { error: "generic" };
  }

  try {
    const outcome = await updateConcept(
      scope.context.concepts,
      scope.context.ownerId,
      conceptId,
      draftFromForm(formData),
    );
    if (!outcome.ok) {
      return { issues: outcome.issues };
    }
  } catch (error) {
    if (error instanceof LibraryError) {
      console.error("updateConceptAction", error);
      return { error: "generic" };
    }
    throw error;
  }

  revalidatePath(`/${locale}/concepts`);
  revalidatePath(`/${locale}/concepts/${conceptId}`);
  redirect(`/${locale}/concepts`);
}

export async function setConceptArchivedAction(formData: FormData): Promise<void> {
  const locale = safeLocale(formData);
  const conceptId = String(formData.get("conceptId") ?? "");
  const archived = String(formData.get("archived") ?? "") === "1";
  const scope = await libraryScope();
  if (!scope || conceptId === "") {
    redirect(`/${locale}/concepts`);
  }

  const run = archived ? archiveConcept : restoreConcept;
  await run(scope.context.concepts, scope.context.ownerId, conceptId);

  revalidatePath(`/${locale}/concepts`);
  redirect(`/${locale}/concepts`);
}

/**
 * Etiqueta un concepto por **nombre**: busca una etiqueta del curso cuyo
 * nombre normalizado coincida (`normalizeTagName`, no comparación literal —
 * "Phrasal Verbs" y "phrasal verbs" son la misma etiqueta) y la reutiliza; si
 * no existe, la crea. Sin esto, escribir un nombre que ya existe con otra
 * capitalización chocaría con el índice único del curso (`23505`) en vez de
 * enlazar la etiqueta que ya había.
 */
export async function attachTagAction(
  _prev: TagFormState,
  formData: FormData,
): Promise<TagFormState> {
  const locale = safeLocale(formData);
  const conceptId = String(formData.get("conceptId") ?? "");
  const rawName = formData.get("name");
  const scope = await libraryScope();
  if (!scope || conceptId === "") {
    return { error: "generic" };
  }

  const existingTags = await listTags(scope.context.tags, scope.context.ownerId, scope.course.id);
  const wanted = typeof rawName === "string" ? normalizeTagName(rawName) : "";
  const existing = existingTags.find((tag) => tag.normalizedName === wanted);

  let tagId: string;
  if (existing) {
    tagId = existing.id;
  } else {
    const outcome = await createTag(
      scope.context.tags,
      scope.context.ownerId,
      scope.course.id,
      rawName,
    );
    if (!outcome.ok) {
      return { issues: outcome.issues };
    }
    tagId = outcome.tag.id;
  }

  try {
    await tagConcept(scope.context.tags, scope.context.ownerId, { conceptId, tagId });
  } catch (error) {
    if (error instanceof LibraryError) {
      console.error("attachTagAction", error);
      return { error: "generic" };
    }
    throw error;
  }

  revalidatePath(`/${locale}/concepts/${conceptId}`);
  redirect(`/${locale}/concepts/${conceptId}`);
}

export async function detachTagAction(formData: FormData): Promise<void> {
  const locale = safeLocale(formData);
  const conceptId = String(formData.get("conceptId") ?? "");
  const tagId = String(formData.get("tagId") ?? "");
  const scope = await libraryScope();
  if (!scope || conceptId === "" || tagId === "") {
    redirect(`/${locale}/concepts`);
  }

  await untagConcept(scope.context.tags, scope.context.ownerId, { conceptId, tagId });

  revalidatePath(`/${locale}/concepts/${conceptId}`);
  redirect(`/${locale}/concepts/${conceptId}`);
}

export async function createPracticeItemAction(
  _prev: PracticeItemFormState,
  formData: FormData,
): Promise<PracticeItemFormState> {
  const locale = safeLocale(formData);
  const conceptId = String(formData.get("conceptId") ?? "");
  const scope = await libraryScope();
  if (!scope || conceptId === "") {
    return { error: "generic" };
  }

  try {
    const outcome = await createPracticeItem(
      scope.context.practiceItems,
      scope.context.ownerId,
      conceptId,
      practiceItemDraftFromForm(formData),
    );
    if (!outcome.ok) {
      return { issues: outcome.issues };
    }
  } catch (error) {
    if (error instanceof LibraryError) {
      console.error("createPracticeItemAction", error);
      return { error: "generic" };
    }
    throw error;
  }

  revalidatePath(`/${locale}/concepts/${conceptId}`);
  redirect(`/${locale}/concepts/${conceptId}`);
}

export async function updatePracticeItemAction(
  _prev: PracticeItemFormState,
  formData: FormData,
): Promise<PracticeItemFormState> {
  const locale = safeLocale(formData);
  const conceptId = String(formData.get("conceptId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const scope = await libraryScope();
  if (!scope || conceptId === "" || itemId === "") {
    return { error: "generic" };
  }

  try {
    const outcome = await updatePracticeItem(
      scope.context.practiceItems,
      scope.context.ownerId,
      itemId,
      practiceItemDraftFromForm(formData),
    );
    if (!outcome.ok) {
      return { issues: outcome.issues };
    }
  } catch (error) {
    if (error instanceof LibraryError) {
      console.error("updatePracticeItemAction", error);
      return { error: "generic" };
    }
    throw error;
  }

  revalidatePath(`/${locale}/concepts/${conceptId}`);
  revalidatePath(`/${locale}/concepts/${conceptId}/items/${itemId}`);
  redirect(`/${locale}/concepts/${conceptId}`);
}

export async function setPracticeItemArchivedAction(formData: FormData): Promise<void> {
  const locale = safeLocale(formData);
  const conceptId = String(formData.get("conceptId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const archived = String(formData.get("archived") ?? "") === "1";
  const scope = await libraryScope();
  if (!scope || conceptId === "" || itemId === "") {
    redirect(`/${locale}/concepts`);
  }

  const run = archived ? archivePracticeItem : restorePracticeItem;
  await run(scope.context.practiceItems, scope.context.ownerId, itemId);

  revalidatePath(`/${locale}/concepts/${conceptId}`);
  redirect(`/${locale}/concepts/${conceptId}`);
}

/**
 * Crea la dirección inversa de un ítem existente. `PracticeItemRepository` no
 * tiene `get` (LEX-3.4): se lee la lista del concepto —incluidos los
 * archivados, por si se invierte uno archivado— y se busca, como en el
 * detalle de mazo (LEX-3.5). Si el modo no tiene inversa (`createReversePracticeItem`
 * devuelve `null`), no pasa nada: la pantalla no debería haber ofrecido el
 * botón para ese ítem.
 */
export async function reversePracticeItemAction(formData: FormData): Promise<void> {
  const locale = safeLocale(formData);
  const conceptId = String(formData.get("conceptId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const scope = await libraryScope();
  if (!scope || conceptId === "" || itemId === "") {
    redirect(`/${locale}/concepts`);
  }

  const items = await listPracticeItems(
    scope.context.practiceItems,
    scope.context.ownerId,
    conceptId,
    { includeArchived: true },
  );
  const item = items.find((candidate) => candidate.id === itemId);
  if (item) {
    try {
      await createReversePracticeItem(scope.context.practiceItems, scope.context.ownerId, item);
    } catch (error) {
      if (error instanceof LibraryError) {
        console.error("reversePracticeItemAction", error);
      } else {
        throw error;
      }
    }
  }

  revalidatePath(`/${locale}/concepts/${conceptId}`);
  redirect(`/${locale}/concepts/${conceptId}`);
}
