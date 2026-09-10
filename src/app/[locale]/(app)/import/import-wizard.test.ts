import { describe, expect, it } from "vitest";

import {
  IMPORT_WIZARD_STEPS,
  canJumpToWizardStep,
  furthestWizardStep,
  nextWizardStep,
  previousWizardStep,
  wizardStepIndex,
} from "./import-wizard";

describe("import wizard steps", () => {
  it("recorre archivo → mapeo → mazo → duplicados → confirmar", () => {
    expect([...IMPORT_WIZARD_STEPS]).toEqual([
      "file",
      "mapping",
      "destination",
      "duplicates",
      "confirm",
    ]);
    expect(nextWizardStep("file")).toBe("mapping");
    expect(nextWizardStep("confirm")).toBeNull();
    expect(previousWizardStep("file")).toBeNull();
    expect(previousWizardStep("mapping")).toBe("file");
    expect(wizardStepIndex("confirm")).toBe(4);
  });

  it("no deja saltar por delante del paso más avanzado", () => {
    expect(canJumpToWizardStep("file", "mapping")).toBe(true);
    expect(canJumpToWizardStep("mapping", "mapping")).toBe(true);
    expect(canJumpToWizardStep("destination", "mapping")).toBe(false);
    expect(canJumpToWizardStep("confirm", "duplicates")).toBe(false);
    expect(furthestWizardStep("mapping", "duplicates")).toBe("duplicates");
    expect(furthestWizardStep("confirm", "file")).toBe("confirm");
  });
});
