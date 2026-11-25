import { z } from "zod";
import { readLibraryReturnQuery, type QueryValue } from "@/shared/presentation/library-query";
import { deckListQuery } from "./deck-list-query";
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

export function deckViewQuery(raw: Record<string, QueryValue>): Record<string, string> {
  const query = parseDeckDetailQuery(raw);
  return {
    ...deckListQuery(raw),
    ...deckDetailParams(
      query,
      query.memberOffset / query.limit + 1,
      query.availableOffset / query.limit + 1,
    ),
  };
}

/** A mutation can return only to this deck, with normalized library parameters. */
export function deckDetailReturnPath(locale: string, deckId: string, raw: unknown): string {
  const base = `/${locale === "en" ? "en" : "es"}/decks`;
  if (!z.uuid().safeParse(deckId).success) return base;
  const path = `${base}/${deckId}`;
  const serialized = new URLSearchParams(deckViewQuery(readLibraryReturnQuery(raw))).toString();
  return path + (serialized ? `?${serialized}` : "");
}
