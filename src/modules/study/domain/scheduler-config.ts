/**
 * Configuración que el planificador recibe en cada llamada (LEX-5.2).
 *
 * Forma propia del producto, no `FSRSParameters`. Los valores de V1 los
 * congela LEX-5.3; aquí solo el tipo y un validador defensivo. Los pesos
 * `w` no viajan: el adaptador deja que `generatorParameters` los rellene
 * hasta que LEX-5.3 versiona un vector concreto.
 */

export type SchedulerStep = `${number}${"m" | "h" | "d"}`;

export interface SchedulerConfig {
  requestedRetention: number;
  maximumIntervalDays: number;
  enableFuzz: boolean;
  enableShortTerm: boolean;
  learningSteps: readonly SchedulerStep[];
  relearningSteps: readonly SchedulerStep[];
}

const STEP_PATTERN = /^[1-9]\d*[mhd]$/;

export function isSchedulerStep(value: unknown): value is SchedulerStep {
  return typeof value === "string" && STEP_PATTERN.test(value);
}

export type SchedulerConfigIssue =
  | "schedulerConfig.requestedRetention.outOfRange"
  | "schedulerConfig.maximumIntervalDays.invalid"
  | "schedulerConfig.learningSteps.invalid"
  | "schedulerConfig.relearningSteps.invalid";

/**
 * Rango de retención alineado con el CHECK previsto de `requested_retention`
 * (0.70–0.97). Un intervalo máximo tiene que ser un entero ≥ 1.
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
  return issues;
}
