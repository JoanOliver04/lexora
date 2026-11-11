// @vitest-environment jsdom
import { Blob as NativeBlob } from "node:buffer";
import { createHash, webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadOwnData } from "./browser-export";
const fetchMock = vi.fn(),
  createUrl = vi.fn(),
  revokeUrl = vi.fn();
const bytes = new TextEncoder().encode('{"original":"😀"}');
function response(
  body: Uint8Array = bytes,
  expected = bytes.byteLength,
  checksum = createHash("sha256").update(bytes).digest("hex"),
) {
  return new Response(body.slice(), {
    headers: { "X-Lexora-Bytes": String(expected), "X-Lexora-SHA256": checksum },
  });
}
describe("Publish only a complete verified export", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    createUrl.mockReset().mockReturnValue("blob:verified");
    revokeUrl.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("Blob", NativeBlob);
    vi.stubGlobal("URL", { createObjectURL: createUrl, revokeObjectURL: revokeUrl });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  it("downloads once after byte count and hash match, then releases the object URL", async () => {
    fetchMock.mockResolvedValue(response());
    const progress = vi.fn();
    expect(await downloadOwnData("json", new AbortController().signal, progress)).toEqual({
      ok: true,
    });
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
    expect(createUrl).toHaveBeenCalledTimes(1);
    expect(progress).toHaveBeenLastCalledWith(100);
    vi.runAllTimers();
    expect(revokeUrl).toHaveBeenCalledWith("blob:verified");
  });
  it.each(["short", "overflow", "hash"])("does not publish a %s response", async (kind) => {
    fetchMock.mockResolvedValue(
      kind === "short"
        ? response(bytes.slice(0, 5))
        : kind === "overflow"
          ? response(bytes, 5)
          : response(bytes, bytes.byteLength, "0".repeat(64)),
    );
    expect(await downloadOwnData("json", new AbortController().signal, vi.fn())).toEqual({
      ok: false,
      error: "integrity",
    });
    expect(createUrl).not.toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  });
  it("refuses a cleanly ended but cancelled response", async () => {
    fetchMock.mockResolvedValue(response());
    const controller = new AbortController();
    controller.abort();
    expect(await downloadOwnData("json", controller.signal, vi.fn())).toEqual({
      ok: false,
      error: "interrupted",
    });
    expect(createUrl).not.toHaveBeenCalled();
  });
  it("returns a cooldown without producing an artifact", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "cooldown" }, { status: 429 }));
    expect(await downloadOwnData("csv", new AbortController().signal, vi.fn())).toEqual({
      ok: false,
      error: "cooldown",
    });
    expect(createUrl).not.toHaveBeenCalled();
  });
});
