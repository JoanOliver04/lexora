import { describe, expect, it, vi } from "vitest";

import {
  CompleteOnboardingError,
  completeOnboarding,
  type OnboardingRepository,
} from "./complete-onboarding";

const validRaw = {
  uiLocale: "es",
  declaredLevel: "B1",
  startLevel: "A1",
  dailyNewLimit: 5,
};

function fakeRepository(courseId = "course-1"): OnboardingRepository {
  return {
    completeOnboarding: vi.fn().mockResolvedValue({ courseId }),
  };
}

describe("completeOnboarding", () => {
  it("valida y delega la escritura, devolviendo el id del curso", async () => {
    const repository = fakeRepository("course-42");

    const outcome = await completeOnboarding(repository, "user-1", validRaw);

    expect(outcome).toEqual({ ok: true, courseId: "course-42" });
    expect(repository.completeOnboarding).toHaveBeenCalledWith("user-1", {
      uiLocale: "es",
      declaredLevel: "B1",
      startLevel: "A1",
      dailyNewLimit: 5,
    });
  });

  it("no toca el repositorio si la selección no es válida", async () => {
    const repository = fakeRepository();

    const outcome = await completeOnboarding(repository, "user-1", {
      ...validRaw,
      dailyNewLimit: 999,
    });

    expect(outcome).toEqual({ ok: false, issues: ["onboarding.dailyNewLimit.outOfRange"] });
    expect(repository.completeOnboarding).not.toHaveBeenCalled();
  });

  it("devuelve todas las claves de error de una selección inválida", async () => {
    const repository = fakeRepository();

    const outcome = await completeOnboarding(repository, "user-1", {});

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.issues).toContain("onboarding.uiLocale.invalid");
      expect(outcome.issues).toContain("onboarding.declaredLevel.invalid");
      expect(outcome.issues).toContain("onboarding.startLevel.invalid");
      expect(outcome.issues).toContain("onboarding.dailyNewLimit.notInteger");
    }
    expect(repository.completeOnboarding).not.toHaveBeenCalled();
  });

  it("rechaza un identificador de usuario vacío (error de programación)", async () => {
    const repository = fakeRepository();

    await expect(completeOnboarding(repository, "   ", validRaw)).rejects.toBeInstanceOf(
      CompleteOnboardingError,
    );
    expect(repository.completeOnboarding).not.toHaveBeenCalled();
  });

  it("propaga el fallo del repositorio sin envolverlo de nuevo", async () => {
    const boom = new CompleteOnboardingError("infra caída");
    const repository: OnboardingRepository = {
      completeOnboarding: vi.fn().mockRejectedValue(boom),
    };

    await expect(completeOnboarding(repository, "user-1", validRaw)).rejects.toBe(boom);
  });
});
