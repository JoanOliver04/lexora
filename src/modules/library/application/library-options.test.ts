import { describe, it, expect, vi } from "vitest";
import {
  libraryPageOffset,
  deckOptionQuerySchema,
  conceptOptionsSchema,
  deckOptionsWireSchema,
  readTagPreviews,
  type LibraryOptionsRepository,
} from "./library-options";

describe("library option boundaries", () => {
  it("normalizes hostile page URLs and rejects unaligned action offsets", () => {
    expect(libraryPageOffset(["2", "3"])).toBe(0);
    expect(libraryPageOffset("Infinity")).toBe(0);
    expect(libraryPageOffset("0")).toBe(0);
    expect(libraryPageOffset("51")).toBe(1000);
    expect(libraryPageOffset("9999999")).toBe(19999980);
    expect(deckOptionQuerySchema.safeParse({ search: "valid", offset: 21 }).success).toBe(false);
  });
  it("rejects incomplete page DTOs rather than pretending records do not exist", () => {
    expect(
      deckOptionsWireSchema.safeParse({ items: [], total: 1001, offset: 0, selected: null })
        .success,
    ).toBe(false);
    expect(
      conceptOptionsSchema.safeParse({
        tags: { items: [], total: 1, offset: 0 },
        items: { items: [], total: 0, offset: 0 },
      }).success,
    ).toBe(false);
  });
  it("rejects invalid identities and oversized selections before I/O", () => {
    const tagPreviews = vi.fn();
    const repo = { tagPreviews } as unknown as LibraryOptionsRepository;
    expect(() => readTagPreviews(repo, { ownerId: "invalid", conceptIds: [] })).toThrow();
    expect(() =>
      readTagPreviews(repo, {
        ownerId: "10000000-0000-4000-8000-000000000001",
        conceptIds: Array(21).fill("10000000-0000-4000-8000-000000000001"),
      }),
    ).toThrow();
    expect(tagPreviews).not.toHaveBeenCalled();
  });
});
