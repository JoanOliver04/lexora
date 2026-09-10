/**
 * Pasos visibles del wizard de importación (LEX-4.8, MASTER_SPEC §9.7 1–8).
 * No persiste nada: solo ordena la pantalla. Ejecutar el lote es LEX-4.7.
 */
export const IMPORT_WIZARD_STEPS = [
  "file",
  "mapping",
  "destination",
  "duplicates",
  "confirm",
] as const;

export type ImportWizardStep = (typeof IMPORT_WIZARD_STEPS)[number];

export function wizardStepIndex(step: ImportWizardStep): number {
  return IMPORT_WIZARD_STEPS.indexOf(step);
}

export function nextWizardStep(step: ImportWizardStep): ImportWizardStep | null {
  return IMPORT_WIZARD_STEPS[wizardStepIndex(step) + 1] ?? null;
}

export function previousWizardStep(step: ImportWizardStep): ImportWizardStep | null {
  const index = wizardStepIndex(step);
  return index > 0 ? (IMPORT_WIZARD_STEPS[index - 1] ?? null) : null;
}

/** El más avanzado de los dos; para recordar hasta dónde se ha llegado. */
export function furthestWizardStep(a: ImportWizardStep, b: ImportWizardStep): ImportWizardStep {
  return wizardStepIndex(a) >= wizardStepIndex(b) ? a : b;
}

/**
 * Se puede saltar atrás (o al paso actual) si ya se ha visitado. No se
 * adelanta por el indicador: eso es «Continuar», que obliga a ver cada paso.
 */
export function canJumpToWizardStep(target: ImportWizardStep, furthest: ImportWizardStep): boolean {
  return wizardStepIndex(target) <= wizardStepIndex(furthest);
}
