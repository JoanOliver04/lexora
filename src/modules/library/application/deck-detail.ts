import { z } from "zod";
import { CEFR_LEVELS, DECK_CATEGORIES } from "../domain/taxonomy";

const uuid = z.uuid(),
  count = z.number().int().nonnegative().max(2147483647);
const option = z.object({ id: uuid, title: z.string().max(200) }).strict();
const page = z.object({ items: z.array(option).max(100), total: count, offset: count }).strict();
export const deckDetailSchema = z
  .object({
    deck: z
      .object({
        id: uuid,
        courseId: uuid,
        ownerId: uuid,
        title: z.string().max(200),
        description: z.string().nullable(),
        cefrLevel: z.enum(CEFR_LEVELS).nullable(),
        category: z.enum(DECK_CATEGORIES).nullable(),
        position: z.number().int(),
        archivedAt: z.string().nullable(),
        createdAt: z.string(),
        updatedAt: z.string(),
      })
      .strict(),
    memberCount: count,
    pageSize: z.number().int().min(1).max(100),
    members: page,
    available: page,
  })
  .strict()
  .refine(
    (value) =>
      value.members.total <= value.memberCount &&
      [value.members, value.available].every(
        (p) =>
          p.offset < Math.max(1, p.total) &&
          p.items.length === Math.min(value.pageSize, Math.max(0, p.total - p.offset)),
      ),
  );
export type DeckDetail = z.infer<typeof deckDetailSchema>;
export interface DeckDetailQuery {
  memberSearch: string;
  availableSearch: string;
  memberOffset: number;
  availableOffset: number;
  limit: number;
}
export interface DeckDetailRepository {
  read(
    input: DeckDetailQuery & { ownerId: string; courseId: string; deckId: string },
  ): Promise<DeckDetail | null>;
}

/** Repeated or malformed URL parameters do not become unbounded DB patterns. */
export function parseDeckDetailQuery(query: Record<string, unknown>): DeckDetailQuery {
  const search = (value: unknown) =>
    typeof value === "string" ? value.replaceAll("\0", "").trim().slice(0, 200).toWellFormed() : "";
  const offset = (value: unknown) => {
    const page = typeof value === "string" && /^\d{1,8}$/.test(value) ? Number(value) : 1;
    return (Math.min(Math.max(page, 1), 1000000) - 1) * 20;
  };
  return {
    memberSearch: search(query["members"]),
    availableSearch: search(query["available"]),
    memberOffset: offset(query["memberPage"]),
    availableOffset: offset(query["availablePage"]),
    limit: 20,
  };
}

export async function readDeckDetail(
  repository: DeckDetailRepository,
  ownerId: string,
  courseId: string,
  deckId: string,
  query: DeckDetailQuery,
): Promise<DeckDetail | null> {
  if (![ownerId, courseId, deckId].every((value) => uuid.safeParse(value).success)) return null;
  return repository.read({ ...query, ownerId, courseId, deckId });
}
