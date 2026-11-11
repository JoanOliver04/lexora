import { describe, expect, it, vi } from "vitest";
import {
  deckDetailSchema,
  parseDeckDetailQuery,
  readDeckDetail,
  type DeckDetailRepository,
} from "./deck-detail";

const id = "10000000-0000-4000-8000-000000000001";
describe("bounded deck read model", () => {
  it("normalizes hostile URL parameters and bounds search and page values", () => {
    const result = parseDeckDetailQuery({
      members: ["repeated", "parameters"],
      available: " a\0" + "x".repeat(300),
      memberPage: "99999999",
      availablePage: "NaN",
    });
    expect(result.memberSearch).toBe("");
    expect(result.availableSearch.length).toBe(200);
    expect(result.availableSearch).not.toContain("\0");
    expect(result.memberOffset).toBe(19999980);
    expect(result.availableOffset).toBe(0);
    expect(parseDeckDetailQuery({ memberPage: "-4", availablePage: ["2"] }).memberOffset).toBe(0);
  });

  it("does not query storage for a malformed identity or deck URL", async () => {
    const repository: DeckDetailRepository = { read: vi.fn<DeckDetailRepository["read"]>() };
    expect(
      await readDeckDetail(repository, id, id, "invalid", parseDeckDetailQuery({})),
    ).toBeNull();
    expect(repository.read).not.toHaveBeenCalled();
  });

  it("refuses internally inconsistent page counts instead of showing partial data", () => {
    const valid = {
      deck: {
        id,
        ownerId: id,
        courseId: id,
        title: "Synthetic deck",
        description: null,
        cefrLevel: null,
        category: null,
        position: 0,
        archivedAt: null,
        createdAt: "2026-11-11T21:00:00Z",
        updatedAt: "2026-11-11T21:00:00Z",
      },
      memberCount: 1,
      pageSize: 20,
      members: { total: 1, offset: 0, items: [{ id, title: "Synthetic concept" }] },
      available: { total: 0, offset: 0, items: [] },
    };
    expect(deckDetailSchema.safeParse(valid).success).toBe(true);
    expect(deckDetailSchema.safeParse({ ...valid, memberCount: 0 }).success).toBe(false);
    expect(
      deckDetailSchema.safeParse({
        ...valid,
        members: { total: 3, offset: 0, items: valid.members.items },
      }).success,
    ).toBe(false);
    expect(
      deckDetailSchema.safeParse({ ...valid, available: { total: 0, offset: 4, items: [] } })
        .success,
    ).toBe(false);
  });
});
