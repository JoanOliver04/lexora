import { describe, expect, it } from "vitest";

import {
  type SchedulerConfig,
  V1_FSRS6_WEIGHTS,
  V1_SCHEDULER_CONFIG,
  isSchedulerStep,
  schedulerCompatibility,
  validateSchedulerConfig,
} from "./scheduler-config";

const valid: SchedulerConfig = {
  requestedRetention: 0.9,
  maximumIntervalDays: 36_500,
  enableFuzz: false,
  enableShortTerm: true,
  learningSteps: ["1m", "10m"],
  relearningSteps: ["10m"],
  weights: V1_FSRS6_WEIGHTS,
};

describe("isSchedulerStep", () => {
  it("acepta minutos, horas y días con entero ≥ 1", () => {
    expect(isSchedulerStep("1m")).toBe(true);
    expect(isSchedulerStep("10m")).toBe(true);
    expect(isSchedulerStep("1h")).toBe(true);
    expect(isSchedulerStep("2d")).toBe(true);
    expect(isSchedulerStep("0m")).toBe(false);
    expect(isSchedulerStep("10")).toBe(false);
    expect(isSchedulerStep("1s")).toBe(false);
  });
});

describe("validateSchedulerConfig", () => {
  it("acepta una config dentro de rango y la v1 de producto", () => {
    expect(validateSchedulerConfig(valid)).toEqual([]);
    expect(validateSchedulerConfig(V1_SCHEDULER_CONFIG)).toEqual([]);
    expect(V1_SCHEDULER_CONFIG.configVersion).toBe("v1");
    expect(V1_SCHEDULER_CONFIG.enableFuzz).toBe(true);
    expect(V1_SCHEDULER_CONFIG.weights).toHaveLength(21);
  });

  it("rechaza retención fuera de 0.70–0.97 e intervalo no entero", () => {
    expect(validateSchedulerConfig({ ...valid, requestedRetention: 0.5 })).toEqual([
      "schedulerConfig.requestedRetention.outOfRange",
    ]);
    expect(validateSchedulerConfig({ ...valid, maximumIntervalDays: 0 })).toEqual([
      "schedulerConfig.maximumIntervalDays.invalid",
    ]);
  });

  it("rechaza un paso mal formado", () => {
    expect(
      validateSchedulerConfig({
        ...valid,
        learningSteps: ["1m", "nope"] as unknown as SchedulerConfig["learningSteps"],
      }),
    ).toEqual(["schedulerConfig.learningSteps.invalid"]);
  });

  it("exige 21 pesos finitos", () => {
    expect(validateSchedulerConfig({ ...valid, weights: [1, 2, 3] })).toEqual([
      "schedulerConfig.weights.invalid",
    ]);
  });
});

describe("schedulerCompatibility", () => {
  it("acepta el par v1 / 5.4.2 y rechaza un salto de config o de paquete", () => {
    const stored = { schedulerVersion: "5.4.2", configVersion: "v1" };
    expect(schedulerCompatibility(stored, V1_SCHEDULER_CONFIG)).toEqual({ ok: true });
    expect(schedulerCompatibility({ ...stored, configVersion: "v2" }, V1_SCHEDULER_CONFIG)).toEqual(
      {
        ok: false,
        reason: "scheduler-mismatch",
      },
    );
    expect(
      schedulerCompatibility({ ...stored, schedulerVersion: "6.0.0" }, V1_SCHEDULER_CONFIG),
    ).toEqual({ ok: false, reason: "scheduler-mismatch" });
  });
});
