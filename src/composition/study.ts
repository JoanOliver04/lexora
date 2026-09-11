import type { SpacedRepetitionScheduler } from "@/modules/study/application/spaced-repetition-scheduler";
import { createTsFsrsScheduler } from "@/modules/study/infrastructure/ts-fsrs-scheduler";

/**
 * Raíz de composición del módulo `study` (LEX-5.2).
 *
 * `src/composition/` es el único sitio que conoce a la vez el puerto y
 * `ts-fsrs`. El adaptador no necesita identidad: solo traduce estados.
 */
export function createSpacedRepetitionScheduler(): SpacedRepetitionScheduler {
  return createTsFsrsScheduler();
}
