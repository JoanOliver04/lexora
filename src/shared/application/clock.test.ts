import { describe, expect, it } from "vitest";

import { createFixedClock } from "./clock";

describe("createFixedClock", () => {
  it("devuelve siempre el mismo instante", () => {
    const frozen = new Date("2026-09-11T10:00:00.000Z");
    const clock = createFixedClock(frozen);
    const first = clock.now();
    const later = clock.now();
    expect(first.toISOString()).toBe("2026-09-11T10:00:00.000Z");
    expect(later.toISOString()).toBe(first.toISOString());
    expect(first).not.toBe(later);
  });
});
