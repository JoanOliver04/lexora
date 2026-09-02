/**
 * Ítem de práctica (MASTER_SPEC §8.5, §9.6, §13.9).
 *
 * Competencia concreta y programable asociada a un concepto. Cada ítem tendrá
 * su propio estado FSRS (FASE 5) porque distintas habilidades no se dominan al
 * mismo ritmo: reconocimiento y producción son competencias distintas.
 *
 * Lógica pura (LEX-3.1). Los siete modos de §13.9 están reservados en el
 * dominio; solo `basic_recognition`, `basic_recall` y `cloze` pueden activarse
 * en la V1. El CRUD y la elección de dirección inversa son LEX-3.7; la
 * previsualización, LEX-3.11.
 */

import {
  isBlank,
  isPracticeMode,
  isRecord,
  isV1PracticeMode,
  LONG_TEXT_MAX_LENGTH,
  normalizeWhitespace,
  type PracticeMode,
  readOptionalText,
  SHORT_TEXT_MAX_LENGTH,
} from "./taxonomy";

/**
 * Configuración específica del modo. Unión discriminada por `mode`. En la V1
 * `basic_recognition` y `basic_recall` no necesitan nada más; `cloze` guarda
 * las soluciones de los huecos, en orden. Los modos futuros llevan solo el
 * discriminante hasta su versión. §13.9 pide validarlo con una unión Zod en el
 * borde (LEX-3.4); aquí se describe la forma y se valida sin Zod externo.
 */
export type PracticeItemConfig =
  | { mode: "basic_recognition" }
  | { mode: "basic_recall" }
  | { mode: "cloze"; answers: string[] }
  | { mode: "listening_dictation" }
  | { mode: "guided_production" }
  | { mode: "free_production" }
  | { mode: "pronunciation" };

/** Ítem de práctica ya persistido. */
export interface PracticeItem {
  id: string;
  conceptId: string;
  ownerId: string;
  mode: PracticeMode;
  promptText: string;
  answerText: string;
  hintText: string | null;
  config: PracticeItemConfig;
  enabled: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Lo que una persona edita de un ítem. Se asocia a un concepto por fuera. */
export interface PracticeItemDraft {
  mode: PracticeMode;
  promptText: string;
  answerText: string;
  hintText: string | null;
  config: PracticeItemConfig;
}

export type PracticeItemIssue =
  | "practiceItem.mode.invalid"
  | "practiceItem.mode.notAvailableInV1"
  | "practiceItem.promptText.empty"
  | "practiceItem.promptText.tooLong"
  | "practiceItem.answerText.empty"
  | "practiceItem.answerText.tooLong"
  | "practiceItem.hintText.tooLong"
  | "practiceItem.config.modeMismatch"
  | "practiceItem.config.clozeAnswersEmpty";

export type PracticeItemValidation =
  { ok: true; value: PracticeItemDraft } | { ok: false; issues: PracticeItemIssue[] };

/**
 * Valida un borrador de ítem y devuelve **todas** las pegas a la vez. Un modo
 * reservado pero no activable en la V1 se rechaza con
 * `practiceItem.mode.notAvailableInV1`, no se acepta en silencio.
 */
export function validatePracticeItemDraft(raw: unknown): PracticeItemValidation {
  const input = isRecord(raw) ? raw : {};
  const issues: PracticeItemIssue[] = [];

  const mode = input["mode"];
  const modeKnown = isPracticeMode(mode);
  if (!modeKnown) {
    issues.push("practiceItem.mode.invalid");
  } else if (!isV1PracticeMode(mode)) {
    issues.push("practiceItem.mode.notAvailableInV1");
  }

  const rawPrompt = input["promptText"];
  if (isBlank(rawPrompt)) {
    issues.push("practiceItem.promptText.empty");
  } else if (normalizeWhitespace(rawPrompt as string).length > LONG_TEXT_MAX_LENGTH) {
    issues.push("practiceItem.promptText.tooLong");
  }

  const rawAnswer = input["answerText"];
  if (isBlank(rawAnswer)) {
    issues.push("practiceItem.answerText.empty");
  } else if (normalizeWhitespace(rawAnswer as string).length > SHORT_TEXT_MAX_LENGTH) {
    issues.push("practiceItem.answerText.tooLong");
  }

  const hintText = readOptionalText(input["hintText"]);
  if (hintText !== null && hintText.length > SHORT_TEXT_MAX_LENGTH) {
    issues.push("practiceItem.hintText.tooLong");
  }

  // El `config` solo se comprueba si el modo es conocido: sin modo válido,
  // «no coincide con el modo» sería ruido sobre `mode.invalid`.
  const config = input["config"];
  if (modeKnown) {
    if (!isConfigForMode(config, mode)) {
      issues.push("practiceItem.config.modeMismatch");
    } else if (config.mode === "cloze" && normalizeClozeAnswers(config.answers).length === 0) {
      issues.push("practiceItem.config.clozeAnswersEmpty");
    }
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      mode: mode as PracticeMode,
      promptText: normalizeWhitespace(rawPrompt as string),
      answerText: normalizeWhitespace(rawAnswer as string),
      hintText,
      config: normalizeConfig(config as PracticeItemConfig),
    },
  };
}

/** Los modos cuya dirección inversa es otra competencia del mismo tipo. */
export function canReverse(mode: PracticeMode): boolean {
  return mode === "basic_recognition" || mode === "basic_recall";
}

/**
 * Dirección inversa (MASTER_SPEC §8.5, §9.6). Devuelve **otro borrador de ítem
 * del mismo concepto**, nunca otro concepto: intercambia enunciado y respuesta
 * y cambia reconocimiento ⇄ recuperación. Para los demás modos devuelve `null`
 * —no hay una inversa que tenga sentido—. El `hint` no se arrastra: pista de
 * `palabra → significado` rara vez sirve para `significado → palabra`.
 *
 * Quien la use (LEX-3.7) inserta el borrador resultante con el mismo
 * `conceptId` que el original.
 */
export function reverseOf(draft: PracticeItemDraft): PracticeItemDraft | null {
  if (!canReverse(draft.mode)) {
    return null;
  }
  const reversedMode: PracticeMode =
    draft.mode === "basic_recognition" ? "basic_recall" : "basic_recognition";
  return {
    mode: reversedMode,
    promptText: draft.answerText,
    answerText: draft.promptText,
    hintText: null,
    config: { mode: reversedMode },
  };
}

export function isArchived(item: Pick<PracticeItem, "archivedAt">): boolean {
  return item.archivedAt !== null;
}

// ---------------------------------------------------------------------------

function isConfigForMode(config: unknown, mode: PracticeMode): config is PracticeItemConfig {
  if (!isRecord(config) || config["mode"] !== mode) {
    return false;
  }
  if (mode === "cloze") {
    return Array.isArray(config["answers"]);
  }
  return true;
}

function normalizeClozeAnswers(answers: unknown[]): string[] {
  return answers
    .filter((answer): answer is string => typeof answer === "string")
    .map((answer) => answer.trim())
    .filter((answer) => answer !== "");
}

function normalizeConfig(config: PracticeItemConfig): PracticeItemConfig {
  if (config.mode === "cloze") {
    return { mode: "cloze", answers: normalizeClozeAnswers(config.answers) };
  }
  return { mode: config.mode };
}
