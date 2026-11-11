import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test("an existing v1 worker upgrades at the same URL and replaces cached response headers", async ({
  page,
  context,
  baseURL,
}) => {
  let legacy = true;
  // Immutable copy of the actual worker published in PR106. This test-only
  // loopback origin switches bytes/headers without adding a deployed test route.
  const oldWorker = readFileSync("tests/fixtures/pwa/legacy-sw-v1.js");
  const paths = new Set([
    "/sw.js",
    "/offline.html",
    "/offline.css",
    "/offline.js",
    "/icons/lexora.svg",
  ]);
  const server = createServer(async (req, res) => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    if (req.method !== "GET" || !paths.has(path)) {
      res.writeHead(404).end();
      return;
    }
    if (path === "/sw.js" && legacy) {
      res.writeHead(200, {
        "Content-Type": "application/javascript",
        "Cache-Control": "no-store",
        "Service-Worker-Allowed": "/",
      });
      res.end(oldWorker);
      return;
    }
    try {
      const response = await fetch(new URL(path, baseURL), { signal: AbortSignal.timeout(10000) });
      const headers = Object.fromEntries(response.headers);
      for (const name of ["connection", "content-length", "content-encoding", "transfer-encoding"])
        delete headers[name];
      if (legacy)
        for (const name of ["content-security-policy", "x-frame-options", "x-content-type-options"])
          delete headers[name];
      const body = Buffer.from(await response.arrayBuffer());
      res.writeHead(response.status, headers);
      res.end(body);
    } catch {
      res.writeHead(503).end();
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing loopback test server");
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    await page.goto(origin + "/offline.html");
    await page.evaluate(async () => {
      await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
      await navigator.serviceWorker.ready;
    });
    await expect.poll(() => page.evaluate(() => caches.keys())).toContain("lexora-public-v1");
    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL))
      .toBe(origin + "/sw.js");
    expect(
      await page.evaluate(async () => {
        const cached = await (await caches.open("lexora-public-v1")).match("/offline.html");
        return cached?.headers.get("content-security-policy");
      }),
    ).toBeNull();
    await page.evaluate(() => caches.open("unrelated-upgrade-test"));
    legacy = false;
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) throw new Error("Missing v1 registration");
      const claimed = new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), {
          once: true,
        }),
      );
      await registration.update();
      await claimed;
    });
    await expect.poll(() => page.evaluate(() => caches.keys())).not.toContain("lexora-public-v1");
    const upgraded = await page.evaluate(async () => {
      const cache = await caches.open("lexora-public-v2"),
        response = await cache.match("/offline.html");
      return {
        names: await caches.keys(),
        csp: response?.headers.get("content-security-policy"),
        frame: response?.headers.get("x-frame-options"),
        type: response?.headers.get("x-content-type-options"),
      };
    });
    expect(upgraded.names).toContain("lexora-public-v2");
    expect(upgraded.names).toContain("unrelated-upgrade-test");
    expect(upgraded.csp).toContain("script-src 'self'");
    expect(upgraded.frame).toBe("DENY");
    expect(upgraded.type).toBe("nosniff");
    await context.setOffline(true);
    const response = await page.goto(origin + "/en/app");
    expect(response!.headers()["content-security-policy"]).toContain("script-src 'self'");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Connect to carry on.");
  } finally {
    await context.setOffline(false);
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
