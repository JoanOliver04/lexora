/**
 * Puerto y casos de uso de conceptos (LEX-3.4).
 *
 * Como en `deck.ts`: el dominio (`validateConceptDraft`) ya valida `unknown`;
 * el caso de uso valida y delega. El adaptador **no** envía `canonical_key` al
 * insertar —es una columna generada (LEX-3.2); un `insert` que la incluya falla
 * en ejecución con `428C9` aunque el tipo generado la acepte—; la lee de la
 * fila devuelta.
 *
 * El CRUD real y las pantallas son LEX-3.6. La sugerencia de duplicados por
 * `canonicalKey` es LEX-3.10 y añadirá su propio método de lectura.
 */

import {
  canonicalKey,
  type Concept,
  type ConceptDraft,
  type ConceptIssue,
  validateConceptDraft,
} from "@/modules/library/domain/concept";
import type { CefrLevel, ConceptKind } from "@/modules/library/domain/taxonomy";

import { type PageResult, clampLimit, clampOffset } from "@/modules/library/application/pagination";

/**
 * Puerto: alguien sabe leer y escribir conceptos del usuario.
 *
 * `ownerId` de `getClaims()`, nunca del cliente. Sin `delete`: un concepto
 * tiene historial (`archived_at`). Se archiva y se restaura con `setArchived`.
 */
export interface ConceptRepository {
  create(input: { ownerId: string; courseId: string; draft: ConceptDraft }): Promise<Concept>;
  update(input: { ownerId: string; conceptId: string; draft: ConceptDraft }): Promise<Concept>;
  setArchived(input: { ownerId: string; conceptId: string; archived: boolean }): Promise<Concept>;
  /** Conceptos del curso. Excluye los archivados salvo `includeArchived`. Orden: título. */
  list(input: { ownerId: string; courseId: string; includeArchived?: boolean }): Promise<Concept[]>;
  get(input: { ownerId: string; conceptId: string }): Promise<Concept | null>;
  /**
   * Búsqueda paginada por texto/naturaleza/nivel (LEX-3.9). `search` es `ilike`
   * sobre el título (misma justificación que en `DeckRepository.search`:
   * `pg_trgm` diferido hasta que un volumen real lo pida). `total` es el
   * recuento sin paginar.
   */
  search(input: {
    ownerId: string;
    courseId: string;
    includeArchived?: boolean;
    search?: string | undefined;
    kind?: ConceptKind | undefined;
    cefrLevel?: CefrLevel | undefined;
    limit: number;
    offset: number;
  }): Promise<PageResult<Concept>>;
  /**
   * Conceptos vivos (no archivados) del curso cuya `canonical_key` coincide
   * exactamente (LEX-3.10). Es una **sugerencia**, no una restricción: la
   * columna no tiene índice único (LEX-3.2/3.3), así que un `insert` con la
   * misma clave nunca falla por sí solo — quien decide es la persona.
   */
  findByCanonicalKey(input: {
    ownerId: string;
    courseId: string;
    canonicalKey: string;
  }): Promise<Concept[]>;
}

export type ConceptOutcome = { ok: true; concept: Concept } | { ok: false; issues: ConceptIssue[] };

function assertUserId(userId: string): void {
  if (userId.trim() === "") {
    throw new Error("caso de uso de biblioteca invocado sin identificador de usuario");
  }
}

export async function createConcept(
  repository: ConceptRepository,
  ownerId: string,
  courseId: string,
  rawDraft: unknown,
): Promise<ConceptOutcome> {
  assertUserId(ownerId);
  const validation = validateConceptDraft(rawDraft);
  if (!validation.ok) {
    return { ok: false, issues: validation.issues };
  }
  const concept = await repository.create({ ownerId, courseId, draft: validation.value });
  return { ok: true, concept };
}

export async function updateConcept(
  repository: ConceptRepository,
  ownerId: string,
  conceptId: string,
  rawDraft: unknown,
): Promise<ConceptOutcome> {
  assertUserId(ownerId);
  const validation = validateConceptDraft(rawDraft);
  if (!validation.ok) {
    return { ok: false, issues: validation.issues };
  }
  const concept = await repository.update({ ownerId, conceptId, draft: validation.value });
  return { ok: true, concept };
}

export async function archiveConcept(
  repository: ConceptRepository,
  ownerId: string,
  conceptId: string,
): Promise<Concept> {
  assertUserId(ownerId);
  return repository.setArchived({ ownerId, conceptId, archived: true });
}

export async function restoreConcept(
  repository: ConceptRepository,
  ownerId: string,
  conceptId: string,
): Promise<Concept> {
  assertUserId(ownerId);
  return repository.setArchived({ ownerId, conceptId, archived: false });
}

export async function listConcepts(
  repository: ConceptRepository,
  ownerId: string,
  courseId: string,
  options: { includeArchived?: boolean } = {},
): Promise<Concept[]> {
  assertUserId(ownerId);
  return repository.list({ ownerId, courseId, includeArchived: options.includeArchived ?? false });
}

export async function getConcept(
  repository: ConceptRepository,
  ownerId: string,
  conceptId: string,
): Promise<Concept | null> {
  assertUserId(ownerId);
  return repository.get({ ownerId, conceptId });
}

/** Búsqueda paginada de conceptos (LEX-3.9). `limit`/`offset` se acotan aquí. */
export async function searchConcepts(
  repository: ConceptRepository,
  ownerId: string,
  courseId: string,
  options: {
    includeArchived?: boolean;
    search?: string | undefined;
    kind?: ConceptKind | undefined;
    cefrLevel?: CefrLevel | undefined;
    limit?: number;
    offset?: number;
  } = {},
): Promise<PageResult<Concept>> {
  assertUserId(ownerId);
  return repository.search({
    ownerId,
    courseId,
    includeArchived: options.includeArchived ?? false,
    search: options.search,
    kind: options.kind,
    cefrLevel: options.cefrLevel,
    limit: clampLimit(options.limit),
    offset: clampOffset(options.offset),
  });
}

/**
 * Conceptos vivos del curso cuyo título normaliza a la misma `canonicalKey`
 * que `title` (LEX-3.10). Un título en blanco no consulta: `canonicalKey("")`
 * es `""` y no debe listar «coincidencias» de un borrador todavía sin título
 * —la validación real de ese caso la da `createConcept`, no esta función.
 */
export async function findDuplicateConcepts(
  repository: ConceptRepository,
  ownerId: string,
  courseId: string,
  title: string,
): Promise<Concept[]> {
  assertUserId(ownerId);
  const key = canonicalKey(title);
  if (key === "") return [];
  return repository.findByCanonicalKey({ ownerId, courseId, canonicalKey: key });
}
