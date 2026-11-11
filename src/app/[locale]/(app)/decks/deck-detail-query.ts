import { z } from "zod";
import {
  parseDeckDetailQuery,
  type DeckDetailQuery,
} from "@/modules/library/application/deck-detail";

export function deckDetailParams(
  query: DeckDetailQuery,
  memberPage: number,
  availablePage: number,
): Record<string, string> {
  return {
    ...(query.memberSearch ? { members: query.memberSearch } : {}),
    ...(query.availableSearch ? { available: query.availableSearch } : {}),
    ...(memberPage > 1 ? { memberPage: String(memberPage) } : {}),
    ...(availablePage > 1 ? { availablePage: String(availablePage) } : {}),
  };
}

/** A mutation can return only to this deck, with normalized library parameters. */
export function deckDetailReturnPath(locale: string, deckId: string, raw: unknown): string {
  const base = `/${locale === "en" ? "en" : "es"}/decks`;
  if (!z.uuid().safeParse(deckId).success) return base;
  const path = `${base}/${deckId}`;
  // Two 200-code-unit searches can exceed 2 KiB after percent encoding.
  if (typeof raw !== "string" || raw.length > 4096) return path;
  const params = new URLSearchParams(raw),
    known: Record<string, unknown> = {};
  for (const key of ["members", "available", "memberPage", "availablePage"])
    if (params.getAll(key).length === 1) known[key] = params.get(key);
  const query = parseDeckDetailQuery(known);
  const serialized = new URLSearchParams(
    deckDetailParams(query, query.memberOffset / 20 + 1, query.availableOffset / 20 + 1),
  ).toString();
  return path + (serialized ? `?${serialized}` : "");
}
