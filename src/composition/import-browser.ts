"use client";
export {
  readBrowserImportFile,
  transferBrowserImport,
  yieldImportControl,
} from "@/modules/importing/infrastructure/browser-import";
export { prepareBrowserImport } from "@/modules/importing/application/prepare-browser-import";
export {
  requestImportJob,
  runBrowserImport,
} from "@/modules/importing/application/run-browser-import";

import { createPapaParseDelimitedFileParser } from "@/modules/importing/infrastructure/papaparse-delimited-file-parser";
import { parseEoiPack, templatePack, vocabularyKey } from "@/modules/library/domain/eoi";
export async function eoiFromCsv(fileName: string, text: string, skill: "grammar" | "vocabulary") {
  const parsed = createPapaParseDelimitedFileParser().parse(text);
  if (parsed.issues.length)
    throw Error(
      "CSV: " +
        parsed.issues
          .map((i) => i.rowNumber)
          .slice(0, 8)
          .join(", "),
    );
  const title = fileName
    .replace(/\.[^.]+$/, "")
    .replaceAll("_", " ")
    .slice(0, 160);
  const key =
    title
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "deck";
  const pack = templatePack(skill);
  const cards = await Promise.all(
    parsed.rows.map(async (r) => {
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
          skill === "vocabulary"
            ? vocabularyKey(r.front)
            : r.front.toLowerCase().trim().replace(/\s+/g, " "),
        ),
      );
      return {
        ...pack.cards[0],
        key:
          "q" +
          Array.from(new Uint8Array(digest).slice(0, 12), (b) =>
            b.toString(16).padStart(2, "0"),
          ).join(""),
        prompt: r.front,
        answer: r.back,
        tags: r.tags,
      };
    }),
  );
  return parseEoiPack(JSON.stringify({ ...pack, key, title, cards, sources: [] }));
}
