import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const origin = "https://lexora.example";
function worker() {
  const listeners = new Map<string, (event: Record<string, unknown>) => void>();
  const buckets = new Map<string, Map<string, Response>>();
  const precached: Request[] = [];
  const key = (url: string) => new URL(url, origin).href;
  const caches = {
    async open(name: string) {
      if (!buckets.has(name)) buckets.set(name, new Map());
      const entries = buckets.get(name)!;
      return {
        async addAll(requests: Request[]) {
          for (const request of requests) {
            precached.push(request);
            entries.set(key(request.url), new Response(`Public ${new URL(request.url).pathname}`));
          }
        },
        async match(url: string) {
          return entries.get(key(url))?.clone();
        },
      };
    },
    async keys() {
      return [...buckets.keys()];
    },
    async delete(name: string) {
      return buckets.delete(name);
    },
  };
  class WorkerRequest extends Request {
    constructor(url: string, init?: RequestInit) {
      super(new URL(url, origin), init);
    }
  }
  const fetch = vi.fn().mockResolvedValue(new Response("Private live content", { status: 200 }));
  const skipWaiting = vi.fn().mockResolvedValue(undefined),
    claim = vi.fn().mockResolvedValue(undefined);
  runInNewContext(readFileSync("public/sw.js", "utf8"), {
    URL,
    Request: WorkerRequest,
    Response,
    caches,
    fetch,
    self: {
      location: { origin },
      skipWaiting,
      clients: { claim },
      addEventListener: (type: string, listener: (event: Record<string, unknown>) => void) =>
        listeners.set(type, listener),
    },
  });
  return {
    buckets,
    precached,
    fetch,
    skipWaiting,
    claim,
    listeners,
    async lifecycle(type: "install" | "activate") {
      let result: Promise<unknown> | undefined;
      listeners.get(type)!({
        waitUntil: (promise: Promise<unknown>) => {
          result = promise;
        },
      });
      await result;
    },
    request(path: string, mode = "cors", method = "GET") {
      let result: Promise<Response> | undefined;
      listeners.get("fetch")!({
        request: { url: new URL(path, origin).href, mode, method },
        respondWith: (promise: Promise<Response>) => {
          result = promise;
        },
      });
      return result;
    },
  };
}
describe("Public-only service worker cache boundary", () => {
  it("precaches only the neutral fallback, omitting credentials", async () => {
    const w = worker();
    await w.lifecycle("install");
    expect(w.precached.map((r) => new URL(r.url).pathname)).toEqual([
      "/offline.html",
      "/offline.css",
      "/offline.js",
      "/icons/lexora.svg",
    ]);
    expect(w.precached.every((r) => r.credentials === "omit" && r.cache === "reload")).toBe(true);
    expect(w.skipWaiting).toHaveBeenCalledOnce();
  });
  it("never intercepts API, RSC, POST or foreign-origin traffic", () => {
    const w = worker();
    for (const [url, mode, method] of [
      ["/api/account/export", "cors", "POST"],
      ["/api/health", "navigate", "GET"],
      ["/en/app?_rsc=1", "cors", "GET"],
      ["/en/app", "navigate", "POST"],
      ["https://external.example/en/app", "navigate", "GET"],
      ["/offline.css?user=private", "cors", "GET"],
    ])
      expect(w.request(url!, mode!, method!)).toBeUndefined();
    expect(w.fetch).not.toHaveBeenCalled();
  });
  it("does not cache successful private navigation or replace server errors", async () => {
    const w = worker();
    await w.lifecycle("install");
    const before = [...w.buckets.values()].map((b) => b.size);
    expect(await (await w.request("/en/app", "navigate"))!.text()).toBe("Private live content");
    w.fetch.mockResolvedValue(new Response("Server error", { status: 500 }));
    expect((await w.request("/en/app", "navigate"))!.status).toBe(500);
    expect([...w.buckets.values()].map((b) => b.size)).toEqual(before);
  });
  it("returns only public fallback on a failed navigation and cleans only its own old caches", async () => {
    const w = worker();
    await w.lifecycle("install");
    w.buckets.set("unrelated-cache", new Map());
    w.buckets.set("lexora-public-old", new Map());
    await w.lifecycle("activate");
    expect([...w.buckets.keys()]).toEqual(["lexora-public-v1", "unrelated-cache"]);
    expect(w.claim).toHaveBeenCalledOnce();
    w.fetch.mockRejectedValue(new Error("Offline"));
    expect(await (await w.request("/es/app?private=ignored", "navigate"))!.text()).toBe(
      "Public /offline.html",
    );
    expect(w.listeners.has("sync")).toBe(false);
  });
});
