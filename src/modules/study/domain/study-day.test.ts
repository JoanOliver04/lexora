import { describe, expect, it } from "vitest";

import { DEFAULT_STUDY_TIMEZONE, isIanaTimeZone, studyDayWindow } from "./study-day";

describe("isIanaTimeZone", () => {
  it("acepta Europe/Madrid y UTC, rechaza nombres inventados", () => {
    expect(isIanaTimeZone("Europe/Madrid")).toBe(true);
    expect(isIanaTimeZone("UTC")).toBe(true);
    expect(isIanaTimeZone("Mars/Olympus")).toBe(false);
    expect(isIanaTimeZone("")).toBe(false);
    expect(isIanaTimeZone(" Europe/Madrid")).toBe(false);
  });
});

describe("studyDayWindow", () => {
  it("Europe/Madrid en invierno (CET, UTC+1)", () => {
    const window = studyDayWindow(new Date("2026-01-15T10:00:00.000Z"), "Europe/Madrid");
    expect(window.start.toISOString()).toBe("2026-01-14T23:00:00.000Z");
    expect(window.end.toISOString()).toBe("2026-01-15T23:00:00.000Z");
  });

  it("Europe/Madrid en verano (CEST, UTC+2)", () => {
    const window = studyDayWindow(new Date("2026-07-15T10:00:00.000Z"), "Europe/Madrid");
    expect(window.start.toISOString()).toBe("2026-07-14T22:00:00.000Z");
    expect(window.end.toISOString()).toBe("2026-07-15T22:00:00.000Z");
  });

  it("el instante justo antes de medianoche local sigue en el día anterior", () => {
    const before = studyDayWindow(new Date("2026-09-10T21:59:59.999Z"), "Europe/Madrid");
    expect(before.start.toISOString()).toBe("2026-09-09T22:00:00.000Z");
    expect(before.end.toISOString()).toBe("2026-09-10T22:00:00.000Z");

    const atMidnight = studyDayWindow(new Date("2026-09-10T22:00:00.000Z"), "Europe/Madrid");
    expect(atMidnight.start.toISOString()).toBe("2026-09-10T22:00:00.000Z");
    expect(atMidnight.end.toISOString()).toBe("2026-09-11T22:00:00.000Z");
  });

  it("el cambio de horario de primavera acorta el día a 23 horas", () => {
    const window = studyDayWindow(new Date("2026-03-29T12:00:00.000Z"), "Europe/Madrid");
    expect(window.start.toISOString()).toBe("2026-03-28T23:00:00.000Z");
    expect(window.end.toISOString()).toBe("2026-03-29T22:00:00.000Z");
    expect(window.end.getTime() - window.start.getTime()).toBe(23 * 60 * 60 * 1000);
  });

  it("el cambio de horario de otoño alarga el día a 25 horas", () => {
    const window = studyDayWindow(new Date("2026-10-25T12:00:00.000Z"), "Europe/Madrid");
    expect(window.start.toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(window.end.toISOString()).toBe("2026-10-25T23:00:00.000Z");
    expect(window.end.getTime() - window.start.getTime()).toBe(25 * 60 * 60 * 1000);
  });

  it("UTC corta el día en medianoche UTC", () => {
    const window = studyDayWindow(new Date("2026-09-11T10:00:00.000Z"), "UTC");
    expect(window.start.toISOString()).toBe("2026-09-11T00:00:00.000Z");
    expect(window.end.toISOString()).toBe("2026-09-12T00:00:00.000Z");
  });

  it("la zona por defecto de V1 es Europe/Madrid", () => {
    expect(DEFAULT_STUDY_TIMEZONE).toBe("Europe/Madrid");
  });
});
