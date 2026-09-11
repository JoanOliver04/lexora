import { describe, expect, it } from "vitest";

import { V1_SCHEDULER_CONFIG } from "@/modules/study/domain/scheduler-config";

import {
  parseVersionedSchedulerConfig,
  readVersionedSchedulerConfig,
  serializeVersionedSchedulerConfig,
} from "./scheduler-config";

describe("parseVersionedSchedulerConfig", () => {
  it("acepta el blob v1", () => {
    const result = parseVersionedSchedulerConfig(V1_SCHEDULER_CONFIG);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.configVersion).toBe("v1");
      expect(result.value.requestedRetention).toBe(0.9);
      expect(result.value.enableFuzz).toBe(true);
      expect(result.value.weights).toHaveLength(21);
    }
  });

  it("rechaza una versión desconocida o pesos de más", () => {
    expect(parseVersionedSchedulerConfig({ ...V1_SCHEDULER_CONFIG, configVersion: "v2" })).toEqual({
      ok: false,
      error: "shape",
    });
    expect(
      parseVersionedSchedulerConfig({
        ...V1_SCHEDULER_CONFIG,
        weights: [...V1_SCHEDULER_CONFIG.weights, 1],
      }),
    ).toEqual({ ok: false, error: "shape" });
  });

  it("Zod pasa la forma y el dominio rechaza la retención", () => {
    expect(
      parseVersionedSchedulerConfig({ ...V1_SCHEDULER_CONFIG, requestedRetention: 0.5 }),
    ).toEqual({ ok: false, error: "schedulerConfig.requestedRetention.outOfRange" });
  });
});

describe("serializeVersionedSchedulerConfig", () => {
  it("redondea por JSON y vuelve a parsear igual", () => {
    const serialized = serializeVersionedSchedulerConfig(V1_SCHEDULER_CONFIG);
    const read = readVersionedSchedulerConfig(serialized);
    expect(read).toEqual({ ok: true, value: V1_SCHEDULER_CONFIG });
    expect(readVersionedSchedulerConfig("no-json")).toEqual({ ok: false, error: "shape" });
  });
});
