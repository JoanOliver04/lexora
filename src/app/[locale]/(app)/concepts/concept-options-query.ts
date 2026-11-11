import { z } from "zod";
import { libraryPageOffset } from "@/modules/library/application/library-options";

export function conceptOptionsQuery(raw: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const key of ["tagPage", "itemPage"]) {
    const page = libraryPageOffset(raw[key]) / 20 + 1;
    if (page > 1) params.set(key, String(page));
  }
  return params.toString();
}
export function conceptOptionsReturnPath(
  locale: string,
  conceptId: string,
  raw: unknown,
  saved?: "tag" | "item" | "reverse",
): string {
  const base = `/${locale === "en" ? "en" : "es"}/concepts`;
  if (!z.uuid().safeParse(conceptId).success) return base;
  const params = new URLSearchParams(typeof raw === "string" && raw.length <= 256 ? raw : "");
  const known: Record<string, unknown> = {};
  for (const key of ["tagPage", "itemPage"])
    if (params.getAll(key).length === 1) known[key] = params.get(key);
  const result = new URLSearchParams(conceptOptionsQuery(known));
  if (saved && params.size > 0) {
    result.set("saved", saved);
    if (saved === "item" || saved === "reverse") result.set("itemPage", "1000000");
  }
  return `${base}/${conceptId}${result.size ? "?" + result.toString() : ""}`;
}
