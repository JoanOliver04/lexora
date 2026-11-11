import { z } from "zod";
import { PRACTICE_MODES } from "../domain/taxonomy";

const count = z.number().int().nonnegative().max(2147483647);
const tag = z.object({ id: z.uuid(), displayName: z.string().max(200) }).strict();
const deck = z.object({ id: z.uuid(), title: z.string().max(200) }).strict();
const item = z
  .object({
    id: z.uuid(),
    mode: z.enum(PRACTICE_MODES),
    promptText: z.string(),
    answerText: z.string(),
    archivedAt: z.string().nullable(),
  })
  .strict();
function page<T extends z.ZodType>(entry: T) {
  return z
    .object({ items: z.array(entry).max(20), total: count, offset: count })
    .strict()
    .refine(
      (p) =>
        p.offset % 20 === 0 &&
        p.offset < Math.max(1, p.total) &&
        p.items.length === Math.min(20, p.total - p.offset),
    );
}
export const conceptOptionsSchema = z.object({ tags: page(tag), items: page(item) }).strict();
export const tagPreviewsSchema = z
  .array(
    z
      .object({ conceptId: z.uuid(), total: count, items: z.array(tag).max(3) })
      .strict()
      .refine((p) => p.items.length === Math.min(p.total, 3)),
  )
  .max(20);
export const deckOptionsWireSchema = z
  .object({ items: z.array(deck).max(20), total: count, offset: count, selected: deck.nullable() })
  .strict()
  .refine(
    (p) =>
      p.offset % 20 === 0 &&
      p.offset < Math.max(1, p.total) &&
      p.items.length === Math.min(20, p.total - p.offset),
  );
export type ConceptOptions = z.infer<typeof conceptOptionsSchema>;
export type TagPreview = z.infer<typeof tagPreviewsSchema>[number];
export type DeckOptions = z.infer<typeof deckOptionsWireSchema>;
export interface LibraryOptionsRepository {
  concept(input: {
    ownerId: string;
    courseId: string;
    conceptId: string;
    tagOffset: number;
    itemOffset: number;
  }): Promise<ConceptOptions | null>;
  tagPreviews(input: { ownerId: string; conceptIds: string[] }): Promise<TagPreview[]>;
  decks(input: {
    ownerId: string;
    courseId: string;
    search: string;
    offset: number;
    selectedId?: string;
  }): Promise<DeckOptions>;
}
export function libraryPageOffset(raw: unknown): number {
  const p = typeof raw === "string" && /^\d{1,7}$/.test(raw) ? Number(raw) : 1;
  return (Math.min(Math.max(p, 1), 1000000) - 1) * 20;
}
export const deckOptionQuerySchema = z
  .object({
    search: z.string().max(200),
    offset: z.number().int().min(0).max(19999980).multipleOf(20),
  })
  .strict();
const identity = z.uuid();
export function readConceptOptions(
  repository: LibraryOptionsRepository,
  input: Parameters<LibraryOptionsRepository["concept"]>[0],
) {
  z.object({
    ownerId: identity,
    courseId: identity,
    conceptId: identity,
    tagOffset: count,
    itemOffset: count,
  })
    .strict()
    .parse(input);
  return repository.concept(input);
}
export function readTagPreviews(
  repository: LibraryOptionsRepository,
  input: Parameters<LibraryOptionsRepository["tagPreviews"]>[0],
) {
  z.object({ ownerId: identity, conceptIds: z.array(identity).max(20) })
    .strict()
    .parse(input);
  return repository.tagPreviews(input);
}
export function readDeckOptions(
  repository: LibraryOptionsRepository,
  input: Parameters<LibraryOptionsRepository["decks"]>[0],
) {
  z.object({
    ownerId: identity,
    courseId: identity,
    search: z.string().max(200),
    offset: count,
    selectedId: identity.optional(),
  })
    .strict()
    .parse(input);
  return repository.decks(input);
}
