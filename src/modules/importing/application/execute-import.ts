/**
 * Ejecuta una importación por lotes (LEX-4.7, resumen LEX-4.9, MASTER_SPEC
 * §9.7 pasos 8–10).
 *
 * Cada fila válida nueva —o duplicada con estrategia `copy`— crea un
 * `Concept` (`kind: vocabulary`, título = frente, resumen = reverso) y un
 * `PracticeItem` `basic_recognition` (frente → reverso). Si se pide inversa,
 * un segundo ítem del **mismo** concepto. Las etiquetas van al concepto,
 * reutilizando el nombre normalizado. `skip` no crea: suma `rows_duplicate`
 * y `rows_skipped` (son las mismas filas; no hay otro motivo de omisión).
 *
 * Un fallo de una fila no aborta el lote. El trabajo termina `completed`
 * aunque `rows_failed > 0`; `failed` es solo si se aborta antes de terminar.
 *
 * Idempotencia: cada confirmación es un trabajo nuevo. `skip` evita duplicar
 * la biblioteca; `copy` crea conceptos nuevos a propósito. Un doble envío
 * con `copy` crearía copias de más — el botón pendiente lo mitiga.
 *
 * Sin SQL aquí. Destino: un mazo existente del curso, comprobado por id.
 */

import { type ColumnMapping, applyColumnMapping } from "@/modules/importing/domain/column-mapping";
import { type DuplicateStrategy, classifyImportRows } from "@/modules/importing/domain/duplicates";
import { MAX_ROWS } from "@/modules/importing/domain/limits";
import type {
  ImportRowIssueCode,
  ParsedImportRow,
  RawImportRow,
} from "@/modules/importing/domain/row";
import { sanitizeRowSample } from "@/modules/importing/domain/sanitize";
import { type ConceptRepository } from "@/modules/library/application/concept";
import { type DeckRepository } from "@/modules/library/application/deck";
import { LibraryError } from "@/modules/library/application/library-error";
import { type PracticeItemRepository } from "@/modules/library/application/practice-item";
import { type TagRepository } from "@/modules/library/application/tag";
import { canonicalKey, validateConceptDraft } from "@/modules/library/domain/concept";
import { reverseOf, validatePracticeItemDraft } from "@/modules/library/domain/practice-item";
import { normalizeTagName, validateTagDraft } from "@/modules/library/domain/tag";

import { importErrorMessage } from "./import-error-message";
import {
  type ImportJob,
  type ImportJobError,
  type ImportJobRepository,
  type ImportPersistErrorCode,
} from "./import-job";

export interface ExecuteImportInput {
  ownerId: string;
  courseId: string;
  deckId: string;
  filename: string;
  contentHash: string;
  mapping: ColumnMapping;
  strategy: DuplicateStrategy;
  createReverse: boolean;
  rawRows: RawImportRow[];
  locale: string;
}

export interface ExecuteImportResult {
  job: ImportJob;
  rowsTotal: number;
  rowsCreated: number;
  rowsSkipped: number;
  rowsDuplicate: number;
  rowsFailed: number;
  errors: ImportJobError[];
}

export type ExecuteImportError = "no-deck" | "empty" | "too-many-rows";

function assertUserId(userId: string): void {
  if (userId.trim() === "") {
    throw new Error("caso de uso de importación invocado sin identificador de usuario");
  }
}

function persistCode(code: ImportRowIssueCode): ImportPersistErrorCode {
  return code;
}

function validationCode(conceptIssues: string[], itemIssues: string[]): ImportPersistErrorCode {
  const issues = [...conceptIssues, ...itemIssues];
  if (
    issues.includes("concept.title.tooLong") ||
    issues.includes("practiceItem.promptText.tooLong")
  ) {
    return "front_too_long";
  }
  if (
    issues.includes("concept.summary.tooLong") ||
    issues.includes("practiceItem.answerText.tooLong")
  ) {
    return "back_too_long";
  }
  return "rejected";
}

function sampleOf(rawRows: RawImportRow[], rowNumber: number): string | null {
  const raw = rawRows.find((row) => row.rowNumber === rowNumber);
  if (!raw) return null;
  const sample = sanitizeRowSample(raw.columns.join(" | "));
  return sample === "" ? null : sample;
}

export async function executeImport(
  input: ExecuteImportInput,
  repos: {
    jobs: ImportJobRepository;
    decks: Pick<DeckRepository, "list" | "addConcept">;
    concepts: Pick<ConceptRepository, "list" | "create">;
    practiceItems: Pick<PracticeItemRepository, "create">;
    tags: Pick<TagRepository, "list" | "create" | "tagConcept">;
  },
): Promise<{ ok: true; result: ExecuteImportResult } | { ok: false; error: ExecuteImportError }> {
  assertUserId(input.ownerId);

  if (input.rawRows.length > MAX_ROWS) {
    return { ok: false, error: "too-many-rows" };
  }

  const decks = await repos.decks.list({
    ownerId: input.ownerId,
    courseId: input.courseId,
  });
  const deck = decks.find((item) => item.id === input.deckId);
  if (!deck) {
    return { ok: false, error: "no-deck" };
  }

  const mapped = applyColumnMapping(input.rawRows, input.mapping);
  if (mapped.rows.length === 0 && mapped.issues.length === 0) {
    return { ok: false, error: "empty" };
  }

  const existing = await repos.concepts.list({
    ownerId: input.ownerId,
    courseId: input.courseId,
  });
  const existingKeys = new Set(existing.map((concept) => concept.canonicalKey));
  const classified = classifyImportRows(
    mapped.rows.map((row) => ({ rowNumber: row.rowNumber, key: canonicalKey(row.front) })),
    existingKeys,
  );

  const knownTags = await repos.tags.list({
    ownerId: input.ownerId,
    courseId: input.courseId,
  });
  const tagIdByName = new Map(knownTags.map((tag) => [tag.normalizedName, tag.id]));

  const job = await repos.jobs.create({
    ownerId: input.ownerId,
    courseId: input.courseId,
    deckId: deck.id,
    originalFilename: input.filename,
    contentHash: input.contentHash,
    mappingConfig: {
      front: input.mapping.front,
      back: input.mapping.back,
      tags: input.mapping.tags,
      strategy: input.strategy,
      createReverse: input.createReverse,
    },
  });

  let rowsCreated = 0;
  let rowsSkipped = 0;
  let rowsDuplicate = 0;
  let rowsFailed = 0;
  const rowsTotal = mapped.rows.length + mapped.issues.length;
  const errors: ImportJobError[] = [];

  const recordError = async (rowNumber: number, code: ImportPersistErrorCode): Promise<void> => {
    const entry: ImportJobError = {
      rowNumber,
      code,
      message: importErrorMessage(code, input.locale),
      rowSample: sampleOf(input.rawRows, rowNumber),
    };
    errors.push(entry);
    await repos.jobs.addError({
      ownerId: input.ownerId,
      jobId: job.id,
      ...entry,
    });
  };

  try {
    for (const issue of mapped.issues) {
      await recordError(issue.rowNumber, persistCode(issue.code));
      rowsFailed += 1;
    }

    for (const row of mapped.rows) {
      const duplicate = classified.isDuplicate.has(row.rowNumber);
      if (duplicate) {
        rowsDuplicate += 1;
      }
      if (duplicate && input.strategy === "skip") {
        rowsSkipped += 1;
        continue;
      }

      const imported = await importOneRow(row, {
        ownerId: input.ownerId,
        courseId: input.courseId,
        deckId: deck.id,
        createReverse: input.createReverse,
        concepts: repos.concepts,
        practiceItems: repos.practiceItems,
        decks: repos.decks,
        tags: repos.tags,
        tagIdByName,
      });
      if (!imported.ok) {
        await recordError(row.rowNumber, imported.code);
        rowsFailed += 1;
        continue;
      }
      rowsCreated += 1;
    }

    const completed = await repos.jobs.complete({
      ownerId: input.ownerId,
      jobId: job.id,
      rowsTotal,
      rowsCreated,
      rowsSkipped,
      rowsDuplicate,
      rowsFailed,
    });

    return {
      ok: true,
      result: {
        job: completed,
        rowsTotal: completed.rowsTotal,
        rowsCreated: completed.rowsCreated,
        rowsSkipped: completed.rowsSkipped,
        rowsDuplicate: completed.rowsDuplicate,
        rowsFailed: completed.rowsFailed,
        errors,
      },
    };
  } catch (error) {
    await repos.jobs.fail({ ownerId: input.ownerId, jobId: job.id });
    throw error;
  }
}

async function importOneRow(
  row: ParsedImportRow,
  ctx: {
    ownerId: string;
    courseId: string;
    deckId: string;
    createReverse: boolean;
    concepts: Pick<ConceptRepository, "create">;
    practiceItems: Pick<PracticeItemRepository, "create">;
    decks: Pick<DeckRepository, "addConcept">;
    tags: Pick<TagRepository, "create" | "tagConcept">;
    tagIdByName: Map<string, string>;
  },
): Promise<{ ok: true } | { ok: false; code: ImportPersistErrorCode }> {
  const conceptRaw = {
    kind: "vocabulary",
    title: row.front,
    summary: row.back,
    explanation: null,
    example: null,
    cefrLevel: null,
    sourceReference: null,
  };
  const itemRaw = {
    mode: "basic_recognition",
    promptText: row.front,
    answerText: row.back,
    hintText: null,
    config: { mode: "basic_recognition" as const },
  };

  const conceptValidation = validateConceptDraft(conceptRaw);
  const itemValidation = validatePracticeItemDraft(itemRaw);
  if (!conceptValidation.ok || !itemValidation.ok) {
    return {
      ok: false,
      code: validationCode(
        conceptValidation.ok ? [] : conceptValidation.issues,
        itemValidation.ok ? [] : itemValidation.issues,
      ),
    };
  }

  try {
    const created = await ctx.concepts.create({
      ownerId: ctx.ownerId,
      courseId: ctx.courseId,
      draft: conceptValidation.value,
    });

    await ctx.practiceItems.create({
      ownerId: ctx.ownerId,
      conceptId: created.id,
      draft: itemValidation.value,
    });

    await ctx.decks.addConcept({
      ownerId: ctx.ownerId,
      deckId: ctx.deckId,
      conceptId: created.id,
      position: null,
    });

    for (const tagName of row.tags) {
      await attachImportedTag(tagName, created.id, ctx);
    }

    if (ctx.createReverse) {
      const reversed = reverseOf(itemValidation.value);
      if (reversed) {
        await ctx.practiceItems.create({
          ownerId: ctx.ownerId,
          conceptId: created.id,
          draft: reversed,
        });
      }
    }

    return { ok: true };
  } catch (error) {
    if (error instanceof LibraryError) {
      return { ok: false, code: "rejected" };
    }
    throw error;
  }
}

async function attachImportedTag(
  rawName: string,
  conceptId: string,
  ctx: {
    ownerId: string;
    courseId: string;
    tags: Pick<TagRepository, "create" | "tagConcept">;
    tagIdByName: Map<string, string>;
  },
): Promise<void> {
  const wanted = normalizeTagName(rawName);
  if (wanted === "") return;

  let tagId = ctx.tagIdByName.get(wanted);
  if (!tagId) {
    const validation = validateTagDraft({ name: rawName });
    if (!validation.ok) {
      return;
    }
    const tag = await ctx.tags.create({
      ownerId: ctx.ownerId,
      courseId: ctx.courseId,
      draft: validation.value,
    });
    tagId = tag.id;
    ctx.tagIdByName.set(wanted, tagId);
  }
  await ctx.tags.tagConcept({ ownerId: ctx.ownerId, conceptId, tagId });
}
