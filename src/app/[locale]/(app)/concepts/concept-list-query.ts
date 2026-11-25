import { CEFR_LEVELS, CONCEPT_KINDS } from "@/modules/library/domain/taxonomy";
import {
  collectionPage,
  collectionSearch,
  queryValue,
  type QueryValue,
} from "@/shared/presentation/library-query";

/** Only these filters belong to the list. Detail pages have their own pagination. */
export function conceptListQuery(raw: Record<string, QueryValue>) {
  const search = collectionSearch(raw["q"]);
  const kind = CONCEPT_KINDS.find((value) => value === queryValue(raw["kind"]));
  const level = CEFR_LEVELS.find((value) => value === queryValue(raw["cefrLevel"]));
  const page = collectionPage(raw["page"]);
  return {
    ...(search ? { q: search } : {}),
    ...(kind ? { kind } : {}),
    ...(level ? { cefrLevel: level } : {}),
    ...(queryValue(raw["archived"]) === "1" ? { archived: "1" } : {}),
    ...(page > 1 ? { page: String(page) } : {}),
  };
}
