import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { libraryErrorFrom } from "./library-error";
describe("Library errors at the provider boundary", () => {
  it.each(["23514", "23505", "23503", "42501", "PGRST116", "<private-code>"])(
    "never retains rejected row content or provider details (%s)",
    (code) => {
      const provider = {
        code,
        message: "private-row-title",
        details: "private-row-summary",
        hint: "private-reference",
      };
      const error = libraryErrorFrom(provider, "concept-write");
      expect(error.cause).toBeUndefined();
      expect(inspect(error)).not.toMatch(/private-row|private-reference|private-code/);
      expect(error.message).toContain("concept-write");
    },
  );
});
