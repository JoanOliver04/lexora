import { describe, expect, it } from "vitest";
import { parseEoiPack, answerMatches, templatePack } from "./eoi";
describe("EOI packs", () => {
  it("round-trips all eight templates and accepts a listed answer only", () => {
    for (const skill of [
      "reading",
      "writing",
      "speaking",
      "listening",
      "mediation",
      "pronunciation",
      "vocabulary",
      "grammar",
    ] as const) {
      const pack = templatePack(skill);
      expect(parseEoiPack(JSON.stringify(pack)).cards.length).toBeGreaterThan(0);
    }
    expect(answerMatches(" Informal e-mail ", "informal email", ["informal e-mail"])).toBe(true);
    expect(answerMatches("formal email", "informal email", ["informal e-mail"])).toBe(false);
  });
  it("rejects a broken source reference, wrong evidence and duplicate question keys", () => {
    const pack = templatePack("reading");
    const card = pack.cards[0]!;
    expect(() =>
      parseEoiPack(JSON.stringify({ ...pack, cards: [{ ...card, source: "missing" }] })),
    ).toThrow();
    expect(() =>
      parseEoiPack(JSON.stringify({ ...pack, cards: [{ ...card, evidence: "Does not occur" }] })),
    ).toThrow();
    expect(() => parseEoiPack(JSON.stringify({ ...pack, cards: [card, card] }))).toThrow();
  });
});
