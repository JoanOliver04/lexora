/**
 * Configuración del planificador (LEX-5.2 tipo, LEX-5.3 valores v1).
 *
 * Forma propia del producto, no `FSRSParameters`. Los pesos `w` viajan
 * copiados: un parche de `ts-fsrs` no cambia el calendario en silencio.
 * Zod en `application/` valida la forma JSON; aquí, las reglas.
 */

export type SchedulerStep = `${number}${"m" | "h" | "d"}`;

export const FSRS6_WEIGHT_COUNT = 21;

export const SCHEDULER_CONFIG_VERSION = "v1";
export const SCHEDULER_PACKAGE_VERSION = "5.4.2";
export const SCHEDULER_ALGORITHM = "FSRS-6.0";

/**
 * Pesos FSRS-6 de `ts-fsrs@5.4.2` (`default_w`). Copiados a propósito:
 * el dominio no importa la librería. Si un upgrade cambia `default_w`,
 * el test del adaptador falla y hay que decidir un `v2`.
 */
export const V1_FSRS6_WEIGHTS: readonly number[] = [
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835,
  0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
];

export interface SchedulerConfig {
  requestedRetention: number;
  maximumIntervalDays: number;
  enableFuzz: boolean;
  enableShortTerm: boolean;
  learningSteps: readonly SchedulerStep[];
  relearningSteps: readonly SchedulerStep[];
  weights: readonly number[];
}

/** Blob versionado que se serializa y se anota en estado/log (LEX-5.13). */
export interface VersionedSchedulerConfig extends SchedulerConfig {
  configVersion: typeof SCHEDULER_CONFIG_VERSION;
  schedulerPackageVersion: typeof SCHEDULER_PACKAGE_VERSION;
  algorithm: typeof SCHEDULER_ALGORITHM;
}

/**
 * Configuración de producto V1.
 *
 * - Retención 0,90: default de la librería y punto de partida acordado.
 * - Fuzz **encendido**: evita que muchos ítems venzan el mismo día; está
 *   sembrado (mismo estado + mismo `now` → mismo vencimiento).
 * - Pasos `1m`/`10m` y relearn `10m`: default 5.4.2, comprobados en el spike.
 * - Intervalo máximo 36500 días: default de la librería (~100 años), el
 *   mismo tope que usa FSRS en Anki. No se acorta sin datos de uso.
 */
export const V1_SCHEDULER_CONFIG: VersionedSchedulerConfig = {
  configVersion: SCHEDULER_CONFIG_VERSION,
  schedulerPackageVersion: SCHEDULER_PACKAGE_VERSION,
  algorithm: SCHEDULER_ALGORITHM,
  requestedRetention: 0.9,
  maximumIntervalDays: 36_500,
  enableFuzz: true,
  enableShortTerm: true,
  learningSteps: ["1m", "10m"],
  relearningSteps: ["10m"],
  weights: V1_FSRS6_WEIGHTS,
};

/**
 * Un estado persistido solo se reprograma con el mismo par
 * (paquete, config). Un salto de `configVersion` o de paquete exige
 * ADR + migración + regresión sobre fixtures (LEX-5.13). No hay
 * `migrateParameters()` silencioso.
 */
export function schedulerCompatibility(
  stored: { schedulerVersion: string; configVersion: string },
  config: VersionedSchedulerConfig,
): { ok: true } | { ok: false; reason: "scheduler-mismatch" } {
  if (
    stored.schedulerVersion === config.schedulerPackageVersion &&
    stored.configVersion === config.configVersion
  ) {
    return { ok: true };
  }
  return { ok: false, reason: "scheduler-mismatch" };
}

const STEP_PATTERN = /^[1-9]\d*[mhd]$/;

export function isSchedulerStep(value: unknown): value is SchedulerStep {
  return typeof value === "string" && STEP_PATTERN.test(value);
}

export type SchedulerConfigIssue =
  | "schedulerConfig.requestedRetention.outOfRange"
  | "schedulerConfig.maximumIntervalDays.invalid"
  | "schedulerConfig.learningSteps.invalid"
  | "schedulerConfig.relearningSteps.invalid"
  | "schedulerConfig.weights.invalid";

/**
 * Rango de retención alineado con el CHECK previsto de `requested_retention`
 * (0.70–0.97). Un intervalo máximo tiene que ser un entero ≥ 1. Exactamente
 * 21 pesos finitos (FSRS-6).
 */
export function validateSchedulerConfig(raw: SchedulerConfig): SchedulerConfigIssue[] {
  const issues: SchedulerConfigIssue[] = [];
  if (
    !Number.isFinite(raw.requestedRetention) ||
    raw.requestedRetention < 0.7 ||
    raw.requestedRetention > 0.97
  ) {
    issues.push("schedulerConfig.requestedRetention.outOfRange");
  }
  if (!Number.isInteger(raw.maximumIntervalDays) || raw.maximumIntervalDays < 1) {
    issues.push("schedulerConfig.maximumIntervalDays.invalid");
  }
  if (raw.learningSteps.some((step) => !isSchedulerStep(step))) {
    issues.push("schedulerConfig.learningSteps.invalid");
  }
  if (raw.relearningSteps.some((step) => !isSchedulerStep(step))) {
    issues.push("schedulerConfig.relearningSteps.invalid");
  }
  if (
    raw.weights.length !== FSRS6_WEIGHT_COUNT ||
    raw.weights.some((weight) => !Number.isFinite(weight))
  ) {
    issues.push("schedulerConfig.weights.invalid");
  }
  return issues;
}
