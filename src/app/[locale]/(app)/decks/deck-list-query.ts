import { CEFR_LEVELS, DECK_CATEGORIES } from "@/modules/library/domain/taxonomy";
import {
  collectionPage,
  collectionSearch,
  queryValue,
  readLibraryReturnQuery,
  type QueryValue,
} from "@/shared/presentation/library-query";

export function deckListQuery(raw: Record<string, QueryValue>) {
  const search = collectionSearch(raw["q"]);
  const category = DECK_CATEGORIES.find((value) => value === queryValue(raw["category"]));
  const level = CEFR_LEVELS.find((value) => value === queryValue(raw["cefrLevel"]));
  const page = collectionPage(raw["page"]);
  return {
    ...(search ? { q: search } : {}),
    ...(category ? { category } : {}),
    ...(level ? { cefrLevel: level } : {}),
    ...(queryValue(raw["archived"]) === "1" ? { archived: "1" } : {}),
    ...(page > 1 ? { page: String(page) } : {}),
  };
}

export function deckListReturnPath(locale: string, raw: unknown): string {
  const query = new URLSearchParams(deckListQuery(readLibraryReturnQuery(raw)));
  return `/${locale === "en" ? "en" : "es"}/decks${query.size ? "?" + query : ""}`;
}
