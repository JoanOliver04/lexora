/**
 * Puerto y caso de uso de alta/activación de `LearningState` (LEX-5.6).
 *
 * Decisión documentada:
 *
 * - El estado `New` se crea al **estudiar o activar** un ítem, no al
 *   crearlo en la biblioteca. Un ítem que nunca se estudia no ocupa fila.
 * - La creación es **idempotente**: un segundo `ensure` del mismo
 *   `(owner, ítem)` devuelve la fila existente y no llama al planificador.
 * - Archivar el ítem **no borra** la memoria (el esquema de LEX-5.4 no
 *   tiene trigger; Q-006 opción 1, sin cascada). Un `ensure` posterior
 *   sobre un ítem archivado **con** estado lo devuelve intacto.
 * - Reactivar (quitar `archived_at`) **conserva** el estado. Reiniciar
 *   el calendario es una acción explícita futura, no este caso de uso.
 * - No se crea un `New` sobre un ítem archivado que aún no tiene estado:
 *   no hay nada que estudiar hasta restaurarlo.
 *
 * El reloj llega como `now` (LEX-5.12 centralizará `Clock`). La
 * presentación no envía vencimientos: solo el ítem.
 */

import type { LearningState } from "@/modules/study/domain/memory";
import type { VersionedSchedulerConfig } from "@/modules/study/domain/scheduler-config";
import type { SpacedRepetitionScheduler } from "./spaced-repetition-scheduler";
import { StudyError } from "./study-error";

/** Fila persistida: instantánea de dominio más columnas de concurrencia y versión. */
export interface StoredLearningState {
  id: string;
  ownerId: string;
  practiceItemId: string;
  revision: number;
  schedulerVersion: string;
  configVersion: string;
  createdAt: string;
  updatedAt: string;
  state: LearningState;
}

export interface PracticeItemRef {
  id: string;
  archivedAt: string | null;
}

export interface LearningStateRepository {
  getByItem(input: {
    ownerId: string;
    practiceItemId: string;
  }): Promise<StoredLearningState | null>;
  findPracticeItem(input: {
    ownerId: string;
    practiceItemId: string;
  }): Promise<PracticeItemRef | null>;
  create(input: {
    ownerId: string;
    practiceItemId: string;
    state: LearningState;
    schedulerVersion: string;
    configVersion: string;
  }): Promise<StoredLearningState>;
}

export type EnsureLearningStateResult =
  | { ok: true; stored: StoredLearningState; created: boolean }
  | { ok: false; reason: "not-found" | "archived" };

function assertUserId(userId: string): void {
  if (userId.trim() === "") {
    throw new Error("caso de uso de estudio invocado sin identificador de usuario");
  }
}

export async function ensureLearningState(
  repository: LearningStateRepository,
  scheduler: SpacedRepetitionScheduler,
  input: {
    ownerId: string;
    practiceItemId: string;
    now: Date;
    config: VersionedSchedulerConfig;
  },
): Promise<EnsureLearningStateResult> {
  assertUserId(input.ownerId);

  const existing = await repository.getByItem({
    ownerId: input.ownerId,
    practiceItemId: input.practiceItemId,
  });
  if (existing) {
    return { ok: true, stored: existing, created: false };
  }

  const item = await repository.findPracticeItem({
    ownerId: input.ownerId,
    practiceItemId: input.practiceItemId,
  });
  if (!item) {
    return { ok: false, reason: "not-found" };
  }
  if (item.archivedAt) {
    return { ok: false, reason: "archived" };
  }

  const state = scheduler.createInitialState(input.now, input.config);

  try {
    const stored = await repository.create({
      ownerId: input.ownerId,
      practiceItemId: input.practiceItemId,
      state,
      schedulerVersion: input.config.schedulerPackageVersion,
      configVersion: input.config.configVersion,
    });
    return { ok: true, stored, created: true };
  } catch (error) {
    if (error instanceof StudyError && error.kind === "duplicate") {
      const raced = await repository.getByItem({
        ownerId: input.ownerId,
        practiceItemId: input.practiceItemId,
      });
      if (raced) {
        return { ok: true, stored: raced, created: false };
      }
    }
    throw error;
  }
}
