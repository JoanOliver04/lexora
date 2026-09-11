import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";
import {
  FSRSVersion,
  Grades,
  Rating,
  State,
  createEmptyCard,
  default_enable_fuzz,
  default_enable_short_term,
  default_learning_steps,
  default_maximum_interval,
  default_relearning_steps,
  default_request_retention,
  default_w,
  fsrs,
  generatorParameters,
  migrateParameters,
} from "ts-fsrs";

/**
 * Spike de `ts-fsrs` 5.4.2 (LEX-5.1). No es el adaptador del producto
 * (LEX-5.2): llama a la librería a pelo para fijar el contrato que el
 * puerto tendrá que traducir. El dominio no importa `ts-fsrs`.
 */

const NOW = new Date("2026-09-11T10:00:00.000Z");
const packageJson = JSON.parse(
  readFileSync(resolve(process.cwd(), "node_modules/ts-fsrs/package.json"), "utf8"),
) as { version: string; engines: { node: string }; license: string };

describe("spike ts-fsrs 5.4.2 (LEX-5.1)", () => {
  it("la versión fijada implementa FSRS-6, Node >=20, MIT, 21 pesos", () => {
    expect(packageJson.version).toBe("5.4.2");
    expect(packageJson.engines.node).toBe(">=20.0.0");
    expect(packageJson.license).toBe("MIT");
    expect(FSRSVersion).toBe("v5.4.2 using FSRS-6.0");
    expect(default_w).toHaveLength(21);
    expect(migrateParameters()).toHaveLength(21);
  });

  it("estados 0–3 y valoraciones de usuario 1–4; Manual no es un Grade", () => {
    expect(State.New).toBe(0);
    expect(State.Learning).toBe(1);
    expect(State.Review).toBe(2);
    expect(State.Relearning).toBe(3);
    expect(Rating.Manual).toBe(0);
    expect(Rating.Again).toBe(1);
    expect(Rating.Hard).toBe(2);
    expect(Rating.Good).toBe(3);
    expect(Rating.Easy).toBe(4);
    expect([...Grades]).toEqual([Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]);
    expect(Grades).not.toContain(Rating.Manual);
  });

  it("defaults de configuración que LEX-5.3 tendrá que versionar", () => {
    expect(default_request_retention).toBe(0.9);
    expect(default_maximum_interval).toBe(36_500);
    expect(default_enable_fuzz).toBe(false);
    expect(default_enable_short_term).toBe(true);
    expect(default_learning_steps).toEqual(["1m", "10m"]);
    expect(default_relearning_steps).toEqual(["10m"]);
  });

  it("carta nueva + Good entra en Learning a +10 min; Easy salta a Review", () => {
    const scheduler = fsrs({ enable_fuzz: false });
    const card = createEmptyCard(NOW);
    expect(card.state).toBe(State.New);
    expect(card.due.toISOString()).toBe(NOW.toISOString());
    expect(card.reps).toBe(0);
    expect(card.lapses).toBe(0);

    const good = scheduler.next(card, NOW, Rating.Good);
    expect(good.card.state).toBe(State.Learning);
    expect(good.card.due.toISOString()).toBe("2026-09-11T10:10:00.000Z");
    expect(good.card.learning_steps).toBe(1);
    expect(good.log.rating).toBe(Rating.Good);

    const easy = scheduler.next(card, NOW, Rating.Easy);
    expect(easy.card.state).toBe(State.Review);
    expect(easy.card.due.toISOString()).toBe("2026-09-19T10:00:00.000Z");
    expect(easy.card.scheduled_days).toBe(8);
  });

  it("repeat previsualiza las cuatro valoraciones de usuario", () => {
    const scheduler = fsrs({ enable_fuzz: false });
    const card = createEmptyCard(NOW);
    const preview = scheduler.repeat(card, NOW);
    expect(preview[Rating.Again].card.state).toBe(State.Learning);
    expect(preview[Rating.Hard].card.state).toBe(State.Learning);
    expect(preview[Rating.Good].card.state).toBe(State.Learning);
    expect(preview[Rating.Easy].card.state).toBe(State.Review);
    expect(preview[Rating.Good].card.due.getTime()).toBe(
      scheduler.next(card, NOW, Rating.Good).card.due.getTime(),
    );
  });

  it("sin fuzz, el mismo reloj y la misma carta dan el mismo vencimiento", () => {
    const scheduler = fsrs({ enable_fuzz: false });
    const card = createEmptyCard(NOW);
    const first = scheduler.next(card, NOW, Rating.Good);
    const second = scheduler.next(card, NOW, Rating.Good);
    expect(first.card.due.getTime()).toBe(second.card.due.getTime());
    expect(first.card.stability).toBe(second.card.stability);
    expect(first.card.difficulty).toBe(second.card.difficulty);
  });

  it("el fuzz está sembrado: cambia el intervalo, no lo hace no-determinista", () => {
    const off = fsrs({ enable_fuzz: false });
    const on = fsrs({ enable_fuzz: true });
    const reviewed = off.next(createEmptyCard(NOW), NOW, Rating.Easy).card;
    const atDue = reviewed.due;

    const fuzzedA = on.next(reviewed, atDue, Rating.Good).card;
    const fuzzedB = on.next(reviewed, atDue, Rating.Good).card;
    const plain = off.next(reviewed, atDue, Rating.Good).card;

    expect(fuzzedA.due.getTime()).toBe(fuzzedB.due.getTime());
    expect(fuzzedA.due.getTime()).not.toBe(plain.due.getTime());
  });

  it("generatorParameters redondea por JSON y migrateParameters rellena 21 pesos", () => {
    const params = generatorParameters({
      request_retention: 0.9,
      enable_fuzz: false,
    });
    const roundTrip = JSON.parse(JSON.stringify(params)) as typeof params;
    expect(roundTrip.w).toHaveLength(21);
    expect(roundTrip.learning_steps).toEqual(["1m", "10m"]);
    expect(fsrs(roundTrip).next(createEmptyCard(NOW), NOW, Rating.Good).card.state).toBe(
      State.Learning,
    );
    expect(migrateParameters()).toHaveLength(21);
  });

  it("las fechas de Card son Date: hay que mapearlas a UTC, no serializar a ciegas", () => {
    const result = fsrs({ enable_fuzz: false }).next(createEmptyCard(NOW), NOW, Rating.Good);
    expect(result.card.due).toBeInstanceOf(Date);
    expect(result.log.review).toBeInstanceOf(Date);
    const mapped = {
      due: result.card.due.toISOString(),
      lastReview: result.card.last_review?.toISOString() ?? null,
      state: result.card.state,
      stability: result.card.stability,
      difficulty: result.card.difficulty,
      scheduledDays: result.card.scheduled_days,
      learningSteps: result.card.learning_steps,
      reps: result.card.reps,
      lapses: result.card.lapses,
    };
    expect(mapped.due).toBe("2026-09-11T10:10:00.000Z");
    expect(mapped.lastReview).toBe(NOW.toISOString());
  });
});
