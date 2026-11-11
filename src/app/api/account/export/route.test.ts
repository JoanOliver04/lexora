import { createHash } from "node:crypto";
vi.mock("@/composition/deployment", () => ({ isPrivateAccessEnabled: () => true }));
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { ownData } = vi.hoisted(() => ({ ownData: vi.fn() }));
vi.mock("@/env/client", () => ({ clientEnv: { NEXT_PUBLIC_SITE_URL: "https://lexora.example" } }));
vi.mock("@/composition/data-export", async () => ({
  exportDataForCurrentUser: ownData,
  formatDataExport: (await import("@/modules/data-management/infrastructure/export-format"))
    .formatDataExport,
}));
import { POST } from "./route";
import { EXPORT_ENTITIES, type ExportPayload } from "@/modules/data-management/domain/data-export";
function request(
  body = '{"format":"json"}',
  origin = "https://lexora.example",
  type = "application/json",
) {
  return new Request("https://lexora.example/api/account/export", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": type },
    body,
  });
}
describe("Cookie-authenticated export HTTP contract", () => {
  beforeEach(() => ownData.mockReset().mockResolvedValue({ ok: false, error: "unauthenticated" }));
  it("rejects foreign origin, media type and oversized input before reading data", async () => {
    expect((await POST(request(undefined, "https://foreign.example"))).status).toBe(403);
    expect((await POST(request(undefined, undefined, "text/plain"))).status).toBe(415);
    expect((await POST(request("x".repeat(129)))).status).toBe(413);
    expect((await POST(request('{"format":"json","ownerId":"someone-else"}'))).status).toBe(400);
    expect(ownData).not.toHaveBeenCalled();
  });
  it("requires identity and does not cache failures", async () => {
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("returns explicit cooldown with Retry-After", async () => {
    ownData.mockResolvedValue({ ok: false, error: "cooldown" });
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
  });
  it("streams a private attachment with an independently verifiable checksum", async () => {
    const payload = Object.fromEntries(
      EXPORT_ENTITIES.map((entity) => [entity, []]),
    ) as unknown as ExportPayload;
    payload["concepts"] = [{ title: "<script>literal</script>", id: "owned" }];
    ownData.mockResolvedValue({
      ok: true,
      snapshot: {
        exportedAt: "2026-11-11T12:00:00Z",
        rows: 1,
        payloadText: JSON.stringify(payload),
      },
    });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="lexora-2026-11-11.json"',
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toContain("private, no-store");
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(response.headers.get("x-lexora-bytes")).toBe(String(bytes.byteLength));
    expect(response.headers.get("x-lexora-sha256")).toBe(
      createHash("sha256").update(bytes).digest("hex"),
    );
    expect(JSON.parse(bytes.toString()).payload.concepts[0].title).toBe("<script>literal</script>");
  });
});
