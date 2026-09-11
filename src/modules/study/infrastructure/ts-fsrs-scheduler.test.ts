import { describe, expect, it } from "vitest";

import { default_w } from "ts-fsrs";

import { V1_SCHEDULER_CONFIG } from "@/modules/study/domain/scheduler-config";

import { createTsFsrsScheduler } from "./ts-fsrs-scheduler";

/**
 * Transiciones congeladas sobre `ts-fsrs@5.4.2` con reloj fijo (LEX-5.2).
 * Los números salen del spike LEX-5.1; si una actualización de la librería
 * los cambia, este test debe fallar — no se «arregla» aflojando aserciones.
 */

const NOW = new Date("2026-09-11T10:00:00.000Z");

/** Reloj congelado: fuzz apagado para números exactos. La v1 de producto lo enciende. */
const config = { ...V1_SCHEDULER_CONFIG, enableFuzz: false };

const scheduler = createTsFsrsScheduler();

describe("createTsFsrsScheduler", () => {
  it("createInitialState es New con vencimiento igual a now", () => {
    const state = scheduler.createInitialState(NOW, config);
    expect(state.phase).toBe("new");
    expect(state.dueAt.toISOString()).toBe(NOW.toISOString());
    expect(state.lastReviewedAt).toBeNull();
    expect(state.reps).toBe(0);
    expect(state.lapses).toBe(0);
  });

  it("New + Good → Learning a +10 min; Easy → Review a +8 días", () => {
    const fresh = scheduler.createInitialState(NOW, config);

    const good = scheduler.review(fresh, "good", NOW, config);
    expect(good.rating).toBe("good");
    expect(good.reviewedAt.toISOString()).toBe(NOW.toISOString());
    expect(good.state.phase).toBe("learning");
    expect(good.state.dueAt.toISOString()).toBe("2026-09-11T10:10:00.000Z");
    expect(good.state.learningStep).toBe(1);
    expect(good.state.reps).toBe(1);
    expect(good.state.stability).toBeCloseTo(2.3065, 4);

    const easy = scheduler.review(fresh, "easy", NOW, config);
    expect(easy.state.phase).toBe("review");
    expect(easy.state.dueAt.toISOString()).toBe("2026-09-19T10:00:00.000Z");
    expect(easy.state.scheduledDays).toBe(8);
    expect(easy.state.stability).toBeCloseTo(8.2956, 4);
  });

  it("preview coincide con review para cada valoración, en orden estable", () => {
    const fresh = scheduler.createInitialState(NOW, config);
    const preview = scheduler.preview(fresh, NOW, config);
    expect(preview.map((item) => item.rating)).toEqual(["again", "hard", "good", "easy"]);

    for (const item of preview) {
      const reviewed = scheduler.review(fresh, item.rating, NOW, config);
      expect(reviewed.state.phase).toBe(item.state.phase);
      expect(reviewed.state.dueAt.getTime()).toBe(item.state.dueAt.getTime());
      expect(reviewed.state.stability).toBe(item.state.stability);
    }
  });

  it("ida y vuelta: el estado devuelto se puede volver a programar", () => {
    const fresh = scheduler.createInitialState(NOW, config);
    const afterGood = scheduler.review(fresh, "good", NOW, config).state;
    const later = afterGood.dueAt;
    const second = scheduler.review(afterGood, "good", later, config);
    expect(second.state.reps).toBe(2);
    expect(second.state.dueAt.getTime()).toBeGreaterThan(later.getTime());
  });

  it("sin fuzz, el mismo reloj produce el mismo vencimiento dos veces", () => {
    const fresh = scheduler.createInitialState(NOW, config);
    const first = scheduler.review(fresh, "good", NOW, config);
    const second = scheduler.review(fresh, "good", NOW, config);
    expect(first.state.dueAt.getTime()).toBe(second.state.dueAt.getTime());
    expect(first.state.difficulty).toBe(second.state.difficulty);
  });

  it("los pesos v1 coinciden con default_w de 5.4.2; si cambia la librería, hay que decidir un v2", () => {
    expect([...V1_SCHEDULER_CONFIG.weights]).toEqual([...default_w]);
  });

  it("la v1 con fuzz encendido sigue programando", () => {
    const fresh = scheduler.createInitialState(NOW, V1_SCHEDULER_CONFIG);
    const reviewed = scheduler.review(fresh, "good", NOW, V1_SCHEDULER_CONFIG);
    expect(reviewed.state.phase).toBe("learning");
    expect(reviewed.state.dueAt.getTime()).toBeGreaterThan(NOW.getTime());
  });
});
