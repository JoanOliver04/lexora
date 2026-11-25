import { z } from "zod";
import { libraryPageOffset } from "@/modules/library/application/library-options";
import { parseStudySessionId } from "@/modules/study/application/study-session";
import { readLibraryReturnQuery, type QueryValue } from "@/shared/presentation/library-query";
import { deckViewQuery } from "../decks/deck-detail-query";
import { conceptListQuery } from "./concept-list-query";

export function conceptOrigin(raw: Record<string, QueryValue>) {
  const deckId = z.uuid().safeParse(raw["fromDeck"]).data;
  const filters = deckId ? deckViewQuery(raw) : conceptListQuery(raw);
  const params = new URLSearchParams(filters);
  const path = deckId ? `/decks/${deckId}` : "/concepts";
  return {
    deckId,
    href: path + (params.size ? `?${params}` : "") + (deckId ? "#deck-concepts" : ""),
    query: deckId ? { ...filters, fromDeck: deckId } : filters,
  };
}

export function conceptOptionsQuery(raw: Record<string, QueryValue>): string {
  const params = new URLSearchParams(conceptOrigin(raw).query);
  for (const key of ["tagPage", "itemPage"]) {
    const page = libraryPageOffset(raw[key]) / 20 + 1;
    if (page > 1) params.set(key, String(page));
  }
  return params.toString();
}

export function conceptParentReturnPath(locale: string, raw: unknown): string {
  const origin = conceptOrigin(readLibraryReturnQuery(raw));
  return `/${locale === "en" ? "en" : "es"}${origin.href}`;
}

export function practiceItemOrigin(conceptId: string, raw: Record<string, QueryValue>) {
  const sessionId = parseStudySessionId(raw["fromStudy"]);
  if (sessionId) {
    return { sessionId, href: `/app/study/${sessionId}`, returnQuery: `fromStudy=${sessionId}` };
  }
  const returnQuery = conceptOptionsQuery(raw);
  const href = z.uuid().safeParse(conceptId).success
    ? `/concepts/${conceptId}${returnQuery ? "?" + returnQuery : ""}`
    : "/concepts";
  return { sessionId, href, returnQuery };
}

export function conceptOptionsReturnPath(
  locale: string,
  conceptId: string,
  raw: unknown,
  saved?: "tag" | "item" | "reverse",
): string {
  const base = `/${locale === "en" ? "en" : "es"}/concepts`;
  if (!z.uuid().safeParse(conceptId).success) return base;
  const known = readLibraryReturnQuery(raw);
  const result = new URLSearchParams(conceptOptionsQuery(known));
  if (saved && (known["tagPage"] || known["itemPage"])) {
    result.set("saved", saved);
    if (saved === "item" || saved === "reverse") result.set("itemPage", "1000000");
  }
  return `${base}/${conceptId}${result.size ? "?" + result.toString() : ""}`;
}
