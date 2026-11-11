import { createHash } from "node:crypto";
import Papa from "papaparse";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { formatDataExport, safeSpreadsheetCell } from "./export-format";
import { EXPORT_ENTITIES, type ExportPayload, type ExportSnapshot } from "../domain/data-export";
function fixture(): ExportSnapshot & { payload: ExportPayload } {
  const payload = Object.fromEntries(
    EXPORT_ENTITIES.map((key) => [key, []]),
  ) as unknown as ExportPayload;
  payload.concepts = [
    {
      id: "stable-id",
      title: ' \uFEFF=HYPERLINK("https://example.invalid","x")',
      summary: 'apostrophe\'s, comma, "quote"\nline\r\nRTL \u202Eمرحبا 😀',
      nullable: null,
      empty: "",
      number: 1234.5,
      updated_at: "2026-10-25T01:30:00.123456+00:00",
      metadata: { updated_at: "Literal user text+00:00" },
    },
  ];
  return {
    exportedAt: "2026-11-11T12:00:00.123456Z",
    rows: 1,
    payload,
    get payloadText() {
      return JSON.stringify(payload);
    },
  };
}
describe("Portable data artifacts", () => {
  it("retains literal prototype keys and exact integer/decimal lexemes in both formats", () => {
    const fixtureData = fixture();
    const payloadText = fixtureData.payloadText.replace(
      '"metadata":{"updated_at":"Literal user text+00:00"}',
      '"metadata":{"__proto__":{"kept":true},"constructor":"literal","integer":9007199254740993,"decimal":0.12345678901234567890123456789,"fakeRaw":{"rawJSON":"false"}}',
    );
    const snapshot = { ...fixtureData, payloadText };
    const json = [...formatDataExport(snapshot, "json").chunks()].join("");
    expect(json).toContain('"integer":9007199254740993');
    expect(json).toContain('"decimal":0.12345678901234567890123456789');
    const metadata = JSON.parse(json).payload.concepts[0].metadata;
    expect(Object.hasOwn(metadata, "__proto__")).toBe(true);
    expect(metadata["__proto__"]).toEqual({ kept: true });
    expect(metadata.fakeRaw).toEqual({ rawJSON: "false" });
    expect(Object.prototype).not.toHaveProperty("kept");
    const csv = [...formatDataExport(snapshot, "csv").chunks()].join("");
    const rows = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
    expect(rows.errors).toEqual([]);
    expect(rows.data[0]!["raw_json"]).toContain('"integer":9007199254740993');
    expect(rows.data[0]!["raw_json"]).toContain('"decimal":0.12345678901234567890123456789');
    expect(Object.hasOwn(JSON.parse(rows.data[0]!["raw_json"]!).metadata, "__proto__")).toBe(true);
  });
  it("bounds chunks in a long CSV row as well as JSON", () => {
    const snapshot = fixture();
    snapshot.payload.concepts[0]!["summary"] = "😀".repeat(100000);
    const artifact = formatDataExport(snapshot, "csv");
    const chunks = [...artifact.chunks()];
    expect(chunks.length).toBeGreaterThan(4);
    for (const chunk of chunks) expect(Buffer.byteLength(chunk)).toBeLessThanOrEqual(65536 * 3);
    const body = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
    expect(body.toString()).toBe(chunks.join(""));
    expect(createHash("sha256").update(body).digest("hex")).toBe(artifact.sha256);
  });
  it("keeps canonical data, stable ids, nulls, text and versioned integrity", () => {
    const snapshot = fixture(),
      artifact = formatDataExport(snapshot, "json");
    const body = Buffer.concat([...artifact.chunks()].map((chunk) => Buffer.from(chunk, "utf8")));
    expect(body.byteLength).toBe(artifact.bytes);
    expect(createHash("sha256").update(body).digest("hex")).toBe(artifact.sha256);
    const parsed = JSON.parse(body.toString("utf8"));
    expect(parsed).toMatchObject({
      format: "lexora-account-export",
      formatVersion: 1,
      schemaVersion: 1,
      exportedAtUtc: snapshot.exportedAt,
    });
    expect(createHash("sha256").update(JSON.stringify(parsed.payload)).digest("hex")).toBe(
      parsed.payloadSha256,
    );
    expect(parsed.payload.concepts[0]).toEqual({
      ...snapshot.payload.concepts[0],
      updated_at: "2026-10-25T01:30:00.123456Z",
    });
    expect(parsed.payload.concepts[0].nullable).toBeNull();
    expect(parsed.payload.concepts[0].empty).toBe("");
  });
  it("never splits a surrogate pair when encoding a long payload", () => {
    for (let padding = 0; padding < 3; padding++) {
      const snapshot = fixture();
      snapshot.payload.concepts[0]!["summary"] = "x".repeat(padding) + "😀".repeat(70000);
      const artifact = formatDataExport(snapshot, "json");
      const chunks = [...artifact.chunks()];
      expect(chunks.length).toBeGreaterThan(3);
      const body = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
      expect(body.toString()).toBe(chunks.join(""));
      expect(JSON.parse(body.toString()).payload.concepts[0].summary).toBe(
        snapshot.payload.concepts[0]!["summary"],
      );
    }
  });
  it("CSV round trips through a real parser with safe cells and complete raw records", () => {
    const snapshot = fixture();
    const artifact = formatDataExport(snapshot, "csv");
    const text = [...artifact.chunks()].join("");
    expect(text.startsWith("\uFEFF")).toBe(true);
    const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
    expect(parsed.errors).toEqual([]);
    expect(parsed.data).toHaveLength(1);
    const row = parsed.data[0]!;
    expect(row["id"]).toBe("stable-id");
    expect(row["title"]).toBe("'" + snapshot.payload.concepts[0]!["title"]);
    expect(row["summary"]).toBe(snapshot.payload.concepts[0]!["summary"]);
    expect(JSON.parse(row["raw_json"]!)).toMatchObject({
      nullable: null,
      empty: "",
      number: 1234.5,
    });
    expect(text).toContain("\r\n");
  });
  it.each([
    "=1+2",
    "+cmd()",
    "-2",
    "@SUM(A1)",
    " \t=1",
    "\u00a0=1",
    "\u200f=1",
    "\tword",
    "\rword",
    "\nword",
  ])("neutralizes spreadsheet control %j", (value) =>
    expect(safeSpreadsheetCell(value)).toBe("'" + value),
  );
  it.each(['a,b"c\nd', "apostrophe's", "  literal  ", "مرحبا \u200f", "😀", "", "a=b"])(
    "preserves ordinary literal %j",
    (value) => expect(safeSpreadsheetCell(value)).toBe(value),
  );
});
