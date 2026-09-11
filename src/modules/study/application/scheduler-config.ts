/**
 * Borde de la configuración versionada (LEX-5.3).
 *
 * Zod comprueba la *forma* del JSON (versión, 21 pesos, pasos como
 * string). Las *reglas* (retención 0.70–0.97, pasos `1m`/`10m`, pesos
 * finitos) siguen en el dominio, sin Zod.
 */

import { z } from "zod";

import {
  FSRS6_WEIGHT_COUNT,
  SCHEDULER_ALGORITHM,
  SCHEDULER_CONFIG_VERSION,
  SCHEDULER_PACKAGE_VERSION,
  type VersionedSchedulerConfig,
  validateSchedulerConfig,
} from "@/modules/study/domain/scheduler-config";

const stepSchema = z.string().regex(/^[1-9]\d*[mhd]$/);

export const versionedSchedulerConfigSchema = z.object({
  configVersion: z.literal(SCHEDULER_CONFIG_VERSION),
  schedulerPackageVersion: z.literal(SCHEDULER_PACKAGE_VERSION),
  algorithm: z.literal(SCHEDULER_ALGORITHM),
  requestedRetention: z.number(),
  maximumIntervalDays: z.number(),
  enableFuzz: z.boolean(),
  enableShortTerm: z.boolean(),
  learningSteps: z.array(stepSchema),
  relearningSteps: z.array(stepSchema),
  weights: z.array(z.number()).length(FSRS6_WEIGHT_COUNT),
});

export type SchedulerConfigParseError =
  "shape" | ReturnType<typeof validateSchedulerConfig>[number];

export function parseVersionedSchedulerConfig(
  raw: unknown,
): { ok: true; value: VersionedSchedulerConfig } | { ok: false; error: SchedulerConfigParseError } {
  const parsed = versionedSchedulerConfigSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "shape" };
  }
  const value = parsed.data as VersionedSchedulerConfig;
  const issues = validateSchedulerConfig(value);
  if (issues.length > 0) {
    return { ok: false, error: issues[0]! };
  }
  return { ok: true, value };
}

export function serializeVersionedSchedulerConfig(config: VersionedSchedulerConfig): string {
  return JSON.stringify(config);
}

export function readVersionedSchedulerConfig(
  serialized: string,
): { ok: true; value: VersionedSchedulerConfig } | { ok: false; error: SchedulerConfigParseError } {
  let raw: unknown;
  try {
    raw = JSON.parse(serialized);
  } catch {
    return { ok: false, error: "shape" };
  }
  return parseVersionedSchedulerConfig(raw);
}
