"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getActiveCourseForCurrentUser } from "@/composition/courses";
import { getLibraryContextForCurrentUser } from "@/composition/library";
import { routing } from "@/i18n/routing";
import {
  archiveConcept,
  createConcept,
  restoreConcept,
  updateConcept,
} from "@/modules/library/application/concept";
import { LibraryError } from "@/modules/library/application/library-error";
import { createTag, listTags, tagConcept, untagConcept } from "@/modules/library/application/tag";
import type { ConceptIssue } from "@/modules/library/domain/concept";
import { normalizeTagName, type TagIssue } from "@/modules/library/domain/tag";

/**
 * Server Actions de conceptos y de sus etiquetas. Delgadas (ADR-001), mismo
 * patrón que `decks/actions.ts`.
 */

export interface ConceptFormState {
  issues?: ConceptIssue[];
  error?: "generic";
}

export interface TagFormState {
  issues?: TagIssue[];
  error?: "generic";
}

function safeLocale(formData: FormData): string {
  const raw = String(formData.get("locale") ?? "");
  return routing.locales.includes(raw as (typeof routing.locales)[number])
    ? raw
    : routing.defaultLocale;
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

async function libraryScope() {
  const [context, course] = await Promise.all([
    getLibraryContextForCurrentUser(),
    getActiveCourseForCurrentUser(),
  ]);
  return context && course ? { context, course } : null;
}

export async function createConceptAction(
  _prev: ConceptFormState,
  formData: FormData,
): Promise<ConceptFormState> {
  const locale = safeLocale(formData);
  const scope = await libraryScope();
  if (!scope) {
    return { error: "generic" };
  }

  try {
    const outcome = await createConcept(
      scope.context.concepts,
      scope.context.ownerId,
      scope.course.id,
      draftFromForm(formData),
    );
    if (!outcome.ok) {
      return { issues: outcome.issues };
    }
  } catch (error) {
    if (error instanceof LibraryError) {
      console.error("createConceptAction", error);
      return { error: "generic" };
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
