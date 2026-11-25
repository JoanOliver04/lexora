import { z } from "zod";
import { libraryPageOffset } from "@/modules/library/application/library-options";
import type { QueryValue } from "@/shared/presentation/library-query";
import { conceptListQuery } from "./concept-list-query";

export function conceptOptionsQuery(raw: Record<string, QueryValue>): string {
  const params = new URLSearchParams(conceptListQuery(raw));
  for (const key of ["tagPage", "itemPage"]) {
    const page = libraryPageOffset(raw[key]) / 20 + 1;
    if (page > 1) params.set(key, String(page));
  }
  return params.toString();
}

function readReturnQuery(raw: unknown): Record<string, string> {
  // A 200-character search term can take 1,800 characters when URL-encoded.
  const params = new URLSearchParams(typeof raw === "string" && raw.length <= 2048 ? raw : "");
  return Object.fromEntries([...params].filter(([key]) => params.getAll(key).length === 1));
}

export function conceptListReturnPath(locale: string, raw: unknown): string {
  const query = new URLSearchParams(conceptListQuery(readReturnQuery(raw)));
  return `/${locale === "en" ? "en" : "es"}/concepts${query.size ? "?" + query : ""}`;
}

export function conceptOptionsReturnPath(
  locale: string,
  conceptId: string,
  raw: unknown,
  saved?: "tag" | "item" | "reverse",
): string {
  const base = `/${locale === "en" ? "en" : "es"}/concepts`;
  if (!z.uuid().safeParse(conceptId).success) return base;
  const known = readReturnQuery(raw);
  const result = new URLSearchParams(conceptOptionsQuery(known));
  if (saved && (known["tagPage"] || known["itemPage"])) {
    result.set("saved", saved);
    if (saved === "item" || saved === "reverse") result.set("itemPage", "1000000");
  }
  return `${base}/${conceptId}${result.size ? "?" + result.toString() : ""}`;
}
