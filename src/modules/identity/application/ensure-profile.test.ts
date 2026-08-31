import { describe, expect, it } from "vitest";

import {
  ensureProfile,
  EnsureProfileError,
  type EnsureProfileOutcome,
  type ProfileRepository,
} from "./ensure-profile";

/**
 * El caso de uso depende de un puerto, así que su comportamiento —crear una vez,
 * ser inofensivo al repetir, propagar un fallo real— se prueba sin base de
 * datos. La idempotencia y la concurrencia *a nivel de PostgreSQL* se prueban
 * aparte, en `supabase/tests/database/050-profile-creation.sql`.
 */

class InMemoryProfiles implements ProfileRepository {
  private readonly ids = new Set<string>();
  private readonly onboarded = new Set<string>();

  ensureExists(userId: string): Promise<EnsureProfileOutcome> {
    if (this.ids.has(userId)) {
      return Promise.resolve("already-existed");
    }
    this.ids.add(userId);
    return Promise.resolve("created");
  }

  hasCompletedOnboarding(userId: string): Promise<boolean> {
    return Promise.resolve(this.onboarded.has(userId));
  }

  markOnboarded(userId: string): void {
    this.onboarded.add(userId);
  }

  get size(): number {
    return this.ids.size;
  }
}

describe("ensureProfile", () => {
  it("crea el perfil la primera vez", async () => {
    const repository = new InMemoryProfiles();

    const outcome = await ensureProfile(repository, "user-1");

    expect(outcome).toBe("created");
    expect(repository.size).toBe(1);
  });

  it("es idempotente: repetir la llamada no crea otra fila ni es un error", async () => {
    const repository = new InMemoryProfiles();

    await ensureProfile(repository, "user-1");
    const second = await ensureProfile(repository, "user-1");

    expect(second).toBe("already-existed");
    expect(repository.size).toBe(1);
  });

  it("dos llamadas concurrentes para el mismo usuario dejan una sola fila", async () => {
    const repository = new InMemoryProfiles();

    const outcomes = await Promise.all([
      ensureProfile(repository, "user-1"),
      ensureProfile(repository, "user-1"),
    ]);

    expect(outcomes.filter((o) => o === "created")).toHaveLength(1);
    expect(repository.size).toBe(1);
  });

  it("rechaza un identificador vacío en lugar de tocar el repositorio", async () => {
    const repository = new InMemoryProfiles();

    await expect(ensureProfile(repository, "   ")).rejects.toBeInstanceOf(EnsureProfileError);
    expect(repository.size).toBe(0);
  });

  it("propaga como EnsureProfileError el fallo del repositorio", async () => {
    const brokenRepository: ProfileRepository = {
      ensureExists: () => Promise.reject(new EnsureProfileError("base de datos inalcanzable")),
      hasCompletedOnboarding: () => Promise.resolve(false),
    };

    await expect(ensureProfile(brokenRepository, "user-1")).rejects.toBeInstanceOf(
      EnsureProfileError,
    );
  });
});
