import { describe, expect, it } from "vitest";

import { type SchedulerConfig, isSchedulerStep, validateSchedulerConfig } from "./scheduler-config";

const valid = {
  requestedRetention: 0.9,
  maximumIntervalDays: 36_500,
  enableFuzz: false,
  enableShortTerm: true,
  learningSteps: ["1m", "10m"] as const,
  relearningSteps: ["10m"] as const,
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
  it("acepta una config dentro de rango", () => {
    expect(validateSchedulerConfig(valid)).toEqual([]);
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
});
