/** App Router can supply repeated query parameters as arrays. First value wins. */
export type QueryValue = string | string[] | undefined;
export const COLLECTION_PAGE_SIZE = 20;
export const MAX_COLLECTION_SEARCH_LENGTH = 200;

/** Three 200-character searches can use 5,400 characters after URL encoding. */
export function readLibraryReturnQuery(raw: unknown): Record<string, string> {
  if (typeof raw !== "string" || raw.length > 6144) return {};
  const values = new Map<string, string>();
  const seen = new Set<string>();
  for (const [key, value] of new URLSearchParams(raw)) {
    if (seen.has(key)) values.delete(key);
    else values.set(key, value);
    seen.add(key);
  }
  return Object.fromEntries(values);
}

export function queryValue(value: QueryValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function collectionSearch(value: QueryValue): string | undefined {
  return queryValue(value)?.trim().slice(0, MAX_COLLECTION_SEARCH_LENGTH) || undefined;
}

export function collectionPage(value: QueryValue): number {
  const raw = queryValue(value);
  if (!raw || !/^[1-9]\d*$/.test(raw)) return 1;
  const page = Number(raw);
  return Number.isSafeInteger(page) && Number.isSafeInteger(page * COLLECTION_PAGE_SIZE) ? page : 1;
}

/** Filter changes always return to page one and preserve unrelated filters. */
export function withoutCollectionFilter(query: Record<string, string>, key: string) {
  return Object.fromEntries(
    Object.entries(query).filter(([name]) => name !== key && name !== "page"),
  );
}

export function collectionPageQuery(query: Record<string, string>, page: number) {
  const filters = withoutCollectionFilter(query, "page");
  return page > 1 ? { ...filters, page: String(page) } : filters;
}
