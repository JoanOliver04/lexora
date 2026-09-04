/**
 * Puerto y casos de uso de mazos (LEX-3.4).
 *
 * El dominio (LEX-3.1) ya valida un borrador de mazo a partir de `unknown` de
 * forma defensiva (`validateDeckDraft`), así que aquí no se repite la forma con
 * Zod: cada caso de uso llama al validador de dominio y, si pasa, delega en el
 * puerto. Las invariantes viven en el dominio; la persistencia, detrás del
 * puerto; la traducción de errores, en el adaptador (`LibraryError`).
 *
 * El CRUD real y las pantallas son LEX-3.5. Aquí está el contrato que esa tarea
 * consumirá desde `src/composition/library.ts`.
 */

import type { Concept } from "@/modules/library/domain/concept";
import {
  type Deck,
  type DeckDraft,
  type DeckIssue,
  validateDeckDraft,
} from "@/modules/library/domain/deck";
import type { CefrLevel, DeckCategory } from "@/modules/library/domain/taxonomy";

import { type PageResult, clampLimit, clampOffset } from "@/modules/library/application/pagination";

/** Un concepto dentro de un mazo, con su orden opcional (§13.8). */
export interface DeckConcept {
  concept: Concept;
  position: number | null;
}

/**
 * Puerto: alguien sabe leer y escribir mazos del usuario y su contenido.
 *
 * `ownerId` lo deriva siempre quien llama de la sesión verificada
 * (`getClaims()`), nunca de un valor del cliente (MASTER_SPEC §16.1). La RLS de
 * LEX-3.3 es la segunda barrera, no la única: el caso de uso ya trabaja bajo la
 * identidad del usuario.
 *
 * No hay `delete`: un mazo tiene historial (`archived_at`, LEX-3.2). Se archiva
 * y se desarchiva con `setArchived`.
 */
export interface DeckRepository {
  create(input: { ownerId: string; courseId: string; draft: DeckDraft }): Promise<Deck>;
  update(input: { ownerId: string; deckId: string; draft: DeckDraft }): Promise<Deck>;
  setArchived(input: { ownerId: string; deckId: string; archived: boolean }): Promise<Deck>;
  /** Mazos del curso. Excluye los archivados salvo `includeArchived`. Orden: `position`, luego antigüedad. */
  list(input: { ownerId: string; courseId: string; includeArchived?: boolean }): Promise<Deck[]>;
  addConcept(input: {
    ownerId: string;
    deckId: string;
    conceptId: string;
    position: number | null;
  }): Promise<void>;
  removeConcept(input: { ownerId: string; deckId: string; conceptId: string }): Promise<void>;
  /** Conceptos de un mazo, en su orden. Excluye los conceptos archivados. */
  listConcepts(input: { ownerId: string; deckId: string }): Promise<DeckConcept[]>;
  /**
   * Reescribe `position` de los mazos del curso al orden recibido: el mazo
   * `deckIds[i]` pasa a `position = i`. Solo toca filas del par
   * `(ownerId, courseId)`; un id ajeno o inexistente en la lista no afecta a
   * ninguna fila. No es atómico (§ evidencia LEX-3.5).
   */
  reorder(input: { ownerId: string; courseId: string; deckIds: string[] }): Promise<void>;
  /**
   * Búsqueda paginada por texto/categoría/nivel (LEX-3.9). `search` es `ilike`
   * sobre el título: a los volúmenes de la V1 (mazos de un único curso) un
   * `seq scan` es invisible; `pg_trgm` queda diferido hasta que un volumen real
   * lo justifique (§ evidencia LEX-3.9). `total` es el recuento sin paginar,
   * para construir la paginación.
   */
  search(input: {
    ownerId: string;
    courseId: string;
    includeArchived?: boolean;
    search?: string | undefined;
    category?: DeckCategory | undefined;
    cefrLevel?: CefrLevel | undefined;
    limit: number;
    offset: number;
  }): Promise<PageResult<Deck>>;
  /**
   * Recuento de conceptos vivos (no archivados) por mazo, en una sola
   * consulta para los `deckIds` dados — resuelve el N+1 anotado en la
   * evidencia de LEX-3.5/3.6 (`listDeckConcepts` una vez por mazo).
   */
  countConceptsByDeck(input: {
    ownerId: string;
    deckIds: string[];
  }): Promise<Record<string, number>>;
}

export type DeckOutcome = { ok: true; deck: Deck } | { ok: false; issues: DeckIssue[] };

function assertUserId(userId: string): void {
  if (userId.trim() === "") {
    // Defensa en profundidad: quien llama ya lo deriva de `getClaims()`.
    throw new Error("caso de uso de biblioteca invocado sin identificador de usuario");
  }
}

export async function createDeck(
  repository: DeckRepository,
  ownerId: string,
  courseId: string,
  rawDraft: unknown,
): Promise<DeckOutcome> {
  assertUserId(ownerId);
  const validation = validateDeckDraft(rawDraft);
  if (!validation.ok) {
    return { ok: false, issues: validation.issues };
  }
  const deck = await repository.create({ ownerId, courseId, draft: validation.value });
  return { ok: true, deck };
}

export async function updateDeck(
  repository: DeckRepository,
  ownerId: string,
  deckId: string,
  rawDraft: unknown,
): Promise<DeckOutcome> {
  assertUserId(ownerId);
  const validation = validateDeckDraft(rawDraft);
  if (!validation.ok) {
    return { ok: false, issues: validation.issues };
  }
  const deck = await repository.update({ ownerId, deckId, draft: validation.value });
  return { ok: true, deck };
}

export async function archiveDeck(
  repository: DeckRepository,
  ownerId: string,
  deckId: string,
): Promise<Deck> {
  assertUserId(ownerId);
  return repository.setArchived({ ownerId, deckId, archived: true });
}

export async function restoreDeck(
  repository: DeckRepository,
  ownerId: string,
  deckId: string,
): Promise<Deck> {
  assertUserId(ownerId);
  return repository.setArchived({ ownerId, deckId, archived: false });
}

export async function listDecks(
  repository: DeckRepository,
  ownerId: string,
  courseId: string,
  options: { includeArchived?: boolean } = {},
): Promise<Deck[]> {
  assertUserId(ownerId);
  return repository.list({ ownerId, courseId, includeArchived: options.includeArchived ?? false });
}

/**
 * Reordena en bloque los mazos de un curso. `orderedDeckIds` es la lista
 * completa de mazos visibles en el orden que la persona ha fijado; el adaptador
 * asigna `position = 0..n-1`. La pantalla (LEX-3.5) construye la lista a partir
 * de un movimiento «subir»/«bajar» sobre el orden actual.
 */
export async function reorderDecks(
  repository: DeckRepository,
  ownerId: string,
  courseId: string,
  orderedDeckIds: string[],
): Promise<void> {
  assertUserId(ownerId);
  await repository.reorder({ ownerId, courseId, deckIds: orderedDeckIds });
}

export async function addConceptToDeck(
  repository: DeckRepository,
  ownerId: string,
  input: { deckId: string; conceptId: string; position?: number | null },
): Promise<void> {
  assertUserId(ownerId);
  await repository.addConcept({
    ownerId,
    deckId: input.deckId,
    conceptId: input.conceptId,
    position: input.position ?? null,
  });
}

export async function removeConceptFromDeck(
  repository: DeckRepository,
  ownerId: string,
  input: { deckId: string; conceptId: string },
): Promise<void> {
  assertUserId(ownerId);
  await repository.removeConcept({ ownerId, deckId: input.deckId, conceptId: input.conceptId });
}

export async function listDeckConcepts(
  repository: DeckRepository,
  ownerId: string,
  deckId: string,
): Promise<DeckConcept[]> {
  assertUserId(ownerId);
  return repository.listConcepts({ ownerId, deckId });
}

/**
 * Búsqueda paginada de mazos (LEX-3.9). `limit`/`offset` se acotan aquí, no en
 * la pantalla: un valor fuera de rango en la URL (`?limit=99999`) no llega al
 * adaptador sin pasar por `clampLimit`/`clampOffset`.
 */
export async function searchDecks(
  repository: DeckRepository,
  ownerId: string,
  courseId: string,
  options: {
    includeArchived?: boolean;
    search?: string | undefined;
    category?: DeckCategory | undefined;
    cefrLevel?: CefrLevel | undefined;
    limit?: number;
    offset?: number;
  } = {},
): Promise<PageResult<Deck>> {
  assertUserId(ownerId);
  return repository.search({
    ownerId,
    courseId,
    includeArchived: options.includeArchived ?? false,
    search: options.search,
    category: options.category,
    cefrLevel: options.cefrLevel,
    limit: clampLimit(options.limit),
    offset: clampOffset(options.offset),
  });
}

/** Recuento de conceptos vivos por mazo, en una sola consulta. `deckIds` vacío no consulta. */
export async function countConceptsPerDeck(
  repository: DeckRepository,
  ownerId: string,
  deckIds: string[],
): Promise<Record<string, number>> {
  assertUserId(ownerId);
  if (deckIds.length === 0) return {};
  return repository.countConceptsByDeck({ ownerId, deckIds });
}
