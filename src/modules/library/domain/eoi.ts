import { z } from "zod";

export const skills = [
  "vocabulary",
  "grammar",
  "reading",
  "writing",
  "speaking",
  "listening",
  "mediation",
  "pronunciation",
] as const;
export type Skill = (typeof skills)[number];
const key = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/);
const text = (limit: number) => z.string().trim().min(1).max(limit);
const strings = (max: number, length: number) => z.array(text(length)).max(max).default([]);
export const sourceSchema = z.strictObject({
  key,
  title: text(160),
  text: text(16000).optional(),
  transcript: text(16000).optional(),
  audio: z
    .string()
    .regex(/^[a-zA-Z0-9_-][a-zA-Z0-9_. -]{0,75}\.(mp3|ogg|m4a|wav|webm)$/i)
    .optional(),
});
export const cardSchema = z.strictObject({
  key,
  type: z.enum(["short", "choice", "written", "oral", "imitate", "produce", "word"]),
  prompt: text(200),
  answer: text(500),
  source: key.optional(),
  alternatives: strings(15, 500),
  options: strings(8, 200),
  criteria: strings(3, 240),
  tags: strings(20, 100),
  evidence: text(1500).optional(),
  emphasis: text(160).optional(),
  clip: z.tuple([z.number().nonnegative().max(7200), z.number().positive().max(7200)]).optional(),
});
export type EoiSource = z.infer<typeof sourceSchema>;
export type EoiCard = z.infer<typeof cardSchema>;
const packSchema = z.strictObject({
  format: z.literal("lexora-eoi/1"),
  key,
  title: text(160),
  skill: z.enum(skills),
  level: z.literal("B1"),
  sources: z.array(sourceSchema).max(80),
  cards: z.array(cardSchema).min(1).max(500),
});
export type EoiPack = z.infer<typeof packSchema>;
export function parseEoiPack(input: string): EoiPack {
  if (input.length > 700000) throw Error("pack-size");
  const p = packSchema.parse(JSON.parse(input.replace(/^\uFEFF/, "")));
  const sources = new Map(p.sources.map((s) => [s.key, s]));
  if (
    sources.size !== p.sources.length ||
    new Set(p.cards.map((c) => c.key)).size !== p.cards.length
  )
    throw Error("duplicate-key");
  const words = new Set<string>();
  for (const c of p.cards) {
    const s = c.source ? sources.get(c.source) : undefined;
    if (c.source && !s) throw Error("missing-source: " + c.key);
    if (c.evidence && !(s?.text?.includes(c.evidence) || s?.transcript?.includes(c.evidence)))
      throw Error("evidence: " + c.key);
    if (c.clip && (!s?.audio || c.clip[0] >= c.clip[1])) throw Error("clip: " + c.key);
    if (
      c.type === "choice" &&
      (c.options.length < 2 ||
        new Set(c.options).size !== c.options.length ||
        !c.options.includes(c.answer))
    )
      throw Error("choices: " + c.key);
    if ((p.skill === "vocabulary") !== (c.type === "word")) throw Error("direction: " + c.key);
    if (c.type === "word") {
      const front = canonical(c.prompt);
      if (words.has(front)) throw Error("duplicate-word: " + c.key);
      words.add(front);
    }
    if ((p.skill === "pronunciation" || p.skill === "listening") && !s?.audio)
      throw Error("audio: " + c.key);
    if (p.skill === "reading" && !s?.text) throw Error("reading: " + c.key);
    if (c.emphasis && !c.answer.includes(c.emphasis)) throw Error("emphasis: " + c.key);
  }
  return p;
}
const canonical = (s: string) => s.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
export function answerMatches(attempt: string, model: string, alternatives: string[]) {
  return [model, ...alternatives].some((s) => canonical(s) === canonical(attempt));
}
export const templatePack = (skill: Skill): EoiPack => {
  const c: EoiCard = {
    key: "q1",
    type: "short",
    prompt: "Which bus stops at the theatre?",
    answer: "Bus seven",
    alternatives: ["7", "Bus 7"],
    options: [],
    tags: [],
    criteria: [],
  };
  const s: EoiSource = {
    key: skill + "-notice",
    title: "Bus service",
    text: "Bus seven stops at the theatre. The last service is at nine.",
  };
  switch (skill) {
    case "reading":
      Object.assign(c, { source: s.key, evidence: "Bus seven stops at the theatre." });
      break;
    case "mediation":
      s.text = "El último autobús sale a las nueve.";
      Object.assign(c, {
        source: s.key,
        type: "written",
        prompt: "Tell a visitor when to catch the last bus.",
        answer: "The last bus leaves at nine.",
        alternatives: [],
        criteria: ["Mention the bus.", "Give the correct time."],
      });
      break;
    case "speaking":
    case "writing":
      Object.assign(c, {
        type: skill === "speaking" ? "oral" : "written",
        prompt: "Invite a friend to see a play.",
        answer: "Would you like to see a play with me?",
        alternatives: [],
        criteria: ["Make an invitation.", "Mention the activity."],
      });
      break;
    case "pronunciation":
    case "listening":
      s.audio = "model.mp3";
      s.transcript = "I need the blue one.";
      delete s.text;
      Object.assign(c, {
        source: s.key,
        type: skill === "pronunciation" ? "produce" : "short",
        prompt:
          skill === "pronunciation"
            ? "Correct the colour. Say: I need the blue one."
            : "Which colour does the speaker need?",
        answer: skill === "pronunciation" ? "I need the blue one." : "Blue",
        alternatives: [],
        ...(skill === "pronunciation"
          ? { emphasis: "blue", criteria: ["Is the colour clear?"] }
          : { evidence: "I need the blue one." }),
      });
      break;
    case "vocabulary":
      Object.assign(c, {
        type: "word",
        prompt: "ticket /tíkit/",
        answer: "billete; entrada",
        alternatives: [],
      });
      break;
    case "grammar":
      Object.assign(c, {
        prompt: "She usually ___ (walk) home on Fridays.",
        answer: "walks",
        alternatives: [],
        tags: ["tipo::completar"],
      });
      break;
  }
  return {
    format: "lexora-eoi/1",
    key: skill + "-example",
    title: skill.charAt(0).toUpperCase() + skill.slice(1) + " B1",
    skill,
    level: "B1",
    sources: c.source ? [s] : [],
    cards: [c],
  };
};

export const exerciseSchema = cardSchema.omit({ prompt: true, answer: true });
export type Exercise = z.infer<typeof exerciseSchema>;
export interface SourceContent extends EoiSource {
  hash?: string | undefined;
}
export function sourceContent(value: unknown): Record<string, SourceContent> {
  return z
    .record(
      z.string(),
      sourceSchema.extend({
        hash: z
          .string()
          .regex(/^[0-9a-f]{64}$/)
          .optional(),
      }),
    )
    .parse(value);
}
export interface EoiFront {
  type: EoiCard["type"];
  options: string[];
  sourceKey?: string | undefined;
  passage?: string | undefined;
  audio?: string | undefined;
}
export interface EoiSolution {
  alternatives: string[];
  criteria: string[];
  evidence?: string | undefined;
  emphasis?: string | undefined;
  clip?: [number, number] | undefined;
  audio?: string | undefined;
  transcript?: string | undefined;
}
export function exerciseContent(ex: Exercise, source?: SourceContent) {
  const audio = source?.hash ? "/api/eoi/audio/" + source.hash : undefined;
  const front: EoiFront = {
    type: ex.type,
    options: ex.options,
    sourceKey: ex.source,
    passage: source?.text,
    audio: ex.type === "produce" ? undefined : audio,
  };
  const solution: EoiSolution = {
    alternatives: ex.alternatives,
    criteria: ex.criteria,
    evidence: ex.evidence,
    emphasis: ex.emphasis,
    clip: ex.clip,
    audio,
    transcript: source?.transcript,
  };
  return { exercise: front, solution };
}
