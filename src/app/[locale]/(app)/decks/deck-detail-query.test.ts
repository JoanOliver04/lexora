import { describe, expect, it } from "vitest";
import { deckDetailReturnPath } from "./deck-detail-query";
import { deckListReturnPath } from "./deck-list-query";

const id = "10000000-0000-4000-8000-000000000001";
describe("deck return navigation", () => {
  it("retains only bounded library filters and pages on the same deck", () => {
    const result = deckDetailReturnPath(
      "en",
      id,
      "members=hello&memberPage=2&available=world&next=https%3A%2F%2Fforeign.example",
    );
    const url = new URL(result, "https://lexora.example");
    expect(url.origin).toBe("https://lexora.example");
    expect(url.pathname).toBe(`/en/decks/${id}`);
    expect([...url.searchParams.keys()]).toEqual(["members", "available", "memberPage"]);
    expect(url.searchParams.get("memberPage")).toBe("2");
  });
  it("ignores duplicate or oversized fields and invalid paths", () => {
    expect(deckDetailReturnPath("bad", id, "members=a&members=b&memberPage=NaN")).toBe(
      `/es/decks/${id}`,
    );
    expect(deckDetailReturnPath("es", id, "members=" + "x".repeat(6144))).toBe(`/es/decks/${id}`);
    expect(deckDetailReturnPath("en", "//foreign.example", "")).toBe("/en/decks");
  });
  it("retains deck list filters on save and drops detail-only options", () => {
    expect(
      deckListReturnPath(
        "es",
        "q=viaje&category=grammar&cefrLevel=B1&archived=1&page=2&members=sitio",
      ),
    ).toBe("/es/decks?q=viaje&category=grammar&cefrLevel=B1&archived=1&page=2");
    expect(deckListReturnPath("invalid", "category=x&cefrLevel=AA&page=-2&q=a&q=b")).toBe(
      "/es/decks",
    );
  });
  it("retains both maximum-length Unicode searches after percent encoding", () => {
    const text = "漢".repeat(200);
    const raw = new URLSearchParams({
      members: text,
      available: text,
      memberPage: "2",
      availablePage: "3",
    }).toString();
    expect(raw.length).toBeGreaterThan(2048);
    const result = new URL(deckDetailReturnPath("en", id, raw), "https://lexora.example");
    expect(result.searchParams.get("members")).toBe(text);
    expect(result.searchParams.get("available")).toBe(text);
    expect(result.searchParams.get("memberPage")).toBe("2");
    expect(result.searchParams.get("availablePage")).toBe("3");
  });
});
