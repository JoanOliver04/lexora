/**
 * Puerto y casos de uso de ítems de práctica (LEX-3.4).
 *
 * §13.9 pide validar el `config` discriminado por `mode` con **una unión Zod en
 * el borde**: eso es `practiceItemConfigSchema` aquí. Zod comprueba la *forma*
 * (¿es un objeto?, ¿`mode` es uno de los siete?, ¿`answers` es un array de
 * strings?); las *reglas* —longitudes, en blanco, modo no activable en la V1,
 * cloze sin soluciones— siguen en el dominio (`validatePracticeItemDraft`, sin
 * Zod). El caso de uso pasa el `config` por Zod para obtener un
 * `PracticeItemConfig` tipado y luego entrega el borrador completo al validador
 * de dominio para el veredicto.
 *
 * El CRUD real, la dirección inversa y la previsualización son LEX-3.7 / 3.11.
 * `reverseOf` (dominio) produce **otro borrador del mismo concepto**; quien lo
 * use inserta ese borrador con el mismo `conceptId`.
 */

import { z } from "zod";

import {
  type PracticeItem,
  type PracticeItemConfig,
  type PracticeItemDraft,
  type PracticeItemIssue,
  validatePracticeItemDraft,
} from "@/modules/library/domain/practice-item";

/**
 * Unión discriminada por `mode` para el `config`. Solo forma: los siete modos
 * de §13.9 como literales (el dominio rechaza los cuatro no activables en la
 * V1), y `answers` como array de strings para `cloze` (el dominio limpia y
 * exige que quede alguna). No referencia ninguna constante de `taxonomy.ts`:
 * los literales *son* la forma.
 */
export const practiceItemConfigSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("basic_recognition") }),
  z.object({ mode: z.literal("basic_recall") }),
  z.object({ mode: z.literal("cloze"), answers: z.array(z.string()) }),
  z.object({ mode: z.literal("listening_dictation") }),
  z.object({ mode: z.literal("guided_production") }),
  z.object({ mode: z.literal("free_production") }),
  z.object({ mode: z.literal("pronunciation") }),
]);

/**
 * Intenta leer un `config` arbitrario como `PracticeItemConfig`. `undefined` si
 * la forma no encaja: el caso de uso deja pasar el valor original para que el
 * dominio emita `practiceItem.config.modeMismatch` con precisión.
 */
export function parsePracticeItemConfig(raw: unknown): PracticeItemConfig | undefined {
  const result = practiceItemConfigSchema.safeParse(raw);
  return result.success ? result.data : undefined;
}

/**
 * Puerto: alguien sabe leer y escribir ítems de práctica del usuario.
 *
 * `ownerId` de `getClaims()`, nunca del cliente. Sin `delete`: un ítem tiene
 * historial (`archived_at`). Se archiva y se restaura con `setArchived`.
 */
export interface PracticeItemRepository {
  create(input: {
    ownerId: string;
    conceptId: string;
    draft: PracticeItemDraft;
  }): Promise<PracticeItem>;
  update(input: {
    ownerId: string;
    itemId: string;
    draft: PracticeItemDraft;
  }): Promise<PracticeItem>;
  setArchived(input: { ownerId: string; itemId: string; archived: boolean }): Promise<PracticeItem>;
  /** Ítems de un concepto. Excluye los archivados salvo `includeArchived`. */
  listByConcept(input: {
    ownerId: string;
    conceptId: string;
    includeArchived?: boolean;
  }): Promise<PracticeItem[]>;
}

export type PracticeItemOutcome =
  { ok: true; item: PracticeItem } | { ok: false; issues: PracticeItemIssue[] };

function assertUserId(userId: string): void {
  if (userId.trim() === "") {
    throw new Error("caso de uso de biblioteca invocado sin identificador de usuario");
  }
}

function draftFrom(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) {
    return raw;
  }
  const input = raw as Record<string, unknown>;
  const parsedConfig = parsePracticeItemConfig(input["config"]);
  return {
    ...input,
    // Si Zod no reconoció la forma, se deja el valor original: el dominio
    // emitirá `practiceItem.config.modeMismatch`.
    config: parsedConfig ?? input["config"],
  };
}

export async function createPracticeItem(
  repository: PracticeItemRepository,
  ownerId: string,
  conceptId: string,
  rawDraft: unknown,
): Promise<PracticeItemOutcome> {
  assertUserId(ownerId);
  const validation = validatePracticeItemDraft(draftFrom(rawDraft));
  if (!validation.ok) {
    return { ok: false, issues: validation.issues };
  }
  const item = await repository.create({ ownerId, conceptId, draft: validation.value });
  return { ok: true, item };
}

export async function updatePracticeItem(
  repository: PracticeItemRepository,
  ownerId: string,
  itemId: string,
  rawDraft: unknown,
): Promise<PracticeItemOutcome> {
  assertUserId(ownerId);
  const validation = validatePracticeItemDraft(draftFrom(rawDraft));
  if (!validation.ok) {
    return { ok: false, issues: validation.issues };
  }
  const item = await repository.update({ ownerId, itemId, draft: validation.value });
  return { ok: true, item };
}

export async function archivePracticeItem(
  repository: PracticeItemRepository,
  ownerId: string,
  itemId: string,
): Promise<PracticeItem> {
  assertUserId(ownerId);
  return repository.setArchived({ ownerId, itemId, archived: true });
}

export async function restorePracticeItem(
  repository: PracticeItemRepository,
  ownerId: string,
  itemId: string,
): Promise<PracticeItem> {
  assertUserId(ownerId);
  return repository.setArchived({ ownerId, itemId, archived: false });
}

export async function listPracticeItems(
  repository: PracticeItemRepository,
  ownerId: string,
  conceptId: string,
  options: { includeArchived?: boolean } = {},
): Promise<PracticeItem[]> {
  assertUserId(ownerId);
  return repository.listByConcept({
    ownerId,
    conceptId,
    includeArchived: options.includeArchived ?? false,
  });
}
