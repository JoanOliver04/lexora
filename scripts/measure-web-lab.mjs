/** Local synthetic lab observations, never field CWV or a production load test. */
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) process.loadEnvFile(".env.local");
const origin = process.env.LEXORA_LAB_ORIGIN ?? "http://localhost:3100";
const appTarget = new URL(origin);
if (
  appTarget.hostname !== "localhost" ||
  !["3100", "3102"].includes(appTarget.port) ||
  appTarget.protocol !== "http:"
)
  throw Error("Lab app must be loopback on a reserved port");
const database = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
if (!["localhost", "127.0.0.1"].includes(database.hostname) || database.port !== "54321")
  throw Error("Lab fixtures require the local Supabase project");
const output = mkdtempSync(join(tmpdir(), "lexora-web-lab-"));
console.log(`Lab artifact directory: ${output}`);
const client = createClient(database.href, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const email = `web-lab-${randomUUID()}@example.com`,
  password = `Lab9!${randomUUID()}`;
let owner, browser;
async function checked(query) {
  const { data, error } = await query;
  if (error) throw Error("Synthetic lab database operation failed");
  return data;
}
const observations = [];
const dashboardOnly = process.argv.includes("--dashboard-only");
try {
  if (!dashboardOnly) {
    const probe = await fetch(`${origin}/api/study/reviews`, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: "{}",
    });
    if (probe.status !== 415)
      throw Error(
        "Build with NEXT_PUBLIC_SITE_URL matching the local lab origin before measuring reviews",
      );
  }
  const auth = await checked(client.auth.signUp({ email, password }));
  owner = auth.user?.id;
  if (!owner) throw Error("Synthetic lab identity missing");
  await checked(client.from("profiles").insert({ id: owner }));
  await checked(
    client.rpc("complete_onboarding", {
      p_ui_locale: "es",
      p_declared_level: "A1",
      p_start_level: "A1",
      p_daily_new_limit: 20,
    }),
  );
  const course = await checked(client.from("courses").select("id").single());
  const deck = randomUUID(),
    conceptIds = Array.from({ length: 20 }, () => randomUUID());
  await checked(
    client
      .from("decks")
      .insert({ id: deck, course_id: course.id, owner_id: owner, title: "Synthetic lab deck" }),
  );
  await checked(
    client.from("concepts").insert(
      conceptIds.map((id, index) => ({
        id,
        course_id: course.id,
        owner_id: owner,
        kind: "vocabulary",
        title: `Synthetic lab concept ${index}`,
        summary: "Synthetic meaning",
      })),
    ),
  );
  await checked(
    client
      .from("deck_concepts")
      .insert(conceptIds.map((id) => ({ deck_id: deck, concept_id: id, owner_id: owner }))),
  );
  await checked(
    client.from("practice_items").insert(
      conceptIds.map((id, index) => ({
        concept_id: id,
        owner_id: owner,
        mode: "basic_recognition",
        prompt_text: `Synthetic front ${index}`,
        answer_text: `Synthetic meaning ${index}`,
        config: { mode: "basic_recognition" },
      })),
    ),
  );

  browser = await chromium.launch();
  const login = await browser.newContext();
  login.setDefaultTimeout(15000);
  const loginPage = await login.newPage();
  await loginPage.goto(`${origin}/es/login`);
  await loginPage.getByLabel("Correo", { exact: true }).fill(email);
  await loginPage.getByLabel("Contraseña", { exact: true }).fill(password);
  await loginPage.getByRole("button", { name: "Entrar", exact: true }).click();
  await loginPage.waitForURL(`${origin}/es`);
  const storageState = await login.storageState();
  await loginPage.goto(`${origin}/es/app/study?deck=${deck}`);
  await loginPage.getByRole("button", { name: "Crear sesión", exact: true }).click();
  await loginPage.waitForURL(/\/es\/app\/study\/[0-9a-f-]+$/);
  const sessionId = new URL(loginPage.url()).pathname.split("/").at(-1);
  await login.close();

  const profiles = [
    {
      name: "desktop-en-light",
      locale: "en",
      theme: "light",
      viewport: { width: 1440, height: 900 },
    },
    { name: "mobile-es-dark", locale: "es", theme: "dark", viewport: { width: 393, height: 873 } },
  ];
  const routes = dashboardOnly
    ? ["app"]
    : ["login", "app", "concepts", "import", "app/statistics", `app/study/${sessionId}`];
  for (const profile of profiles)
    for (const route of routes)
      for (let run = 1; run <= 3; run++) {
        const context = await browser.newContext({
          viewport: profile.viewport,
          ...(route === "login" ? {} : { storageState }),
        });
        context.setDefaultTimeout(15000);
        try {
          await context.addInitScript((theme) => {
            localStorage.setItem("lexora-theme", theme);
            window.__lexoraLab = { lcp: null, cls: 0, longTaskMs: 0, longestTaskMs: 0, shifts: [] };
            new PerformanceObserver((list) => {
              for (const e of list.getEntries()) window.__lexoraLab.lcp = e.startTime;
            }).observe({ type: "largest-contentful-paint", buffered: true });
            new PerformanceObserver((list) => {
              for (const e of list.getEntries())
                if (!e.hadRecentInput) {
                  window.__lexoraLab.cls += e.value;
                  window.__lexoraLab.shifts.push({
                    value: e.value,
                    sources: e.sources.map((s) => ({
                      tag: s.node?.nodeName,
                      id: s.node?.id,
                      className: s.node?.className,
                      from: { y: s.previousRect.y, height: s.previousRect.height },
                      to: { y: s.currentRect.y, height: s.currentRect.height },
                    })),
                  });
                }
            }).observe({ type: "layout-shift", buffered: true });
            new PerformanceObserver((list) => {
              for (const e of list.getEntries()) {
                window.__lexoraLab.longTaskMs += e.duration;
                window.__lexoraLab.longestTaskMs = Math.max(
                  window.__lexoraLab.longestTaskMs,
                  e.duration,
                );
              }
            }).observe({ type: "longtask", buffered: true });
          }, profile.theme);
          const page = await context.newPage(),
            cdp = await context.newCDPSession(page);
          await cdp.send("Network.enable");
          await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
          await cdp.send("Network.emulateNetworkConditions", {
            offline: false,
            latency: 40,
            downloadThroughput: 1600000 / 8,
            uploadThroughput: 750000 / 8,
          });
          await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
          const response = await page.goto(`${origin}/${profile.locale}/${route}`, {
            waitUntil: "networkidle",
          });
          if (!response?.ok()) throw Error("Lab route failed");
          await page.locator("h1").first().waitFor();
          await page.waitForTimeout(2000);
          const metrics = await page.evaluate(() => {
            const navigation = performance.getEntriesByType("navigation")[0];
            const scripts = performance
              .getEntriesByType("resource")
              .filter((e) => new URL(e.name).pathname.endsWith(".js"));
            return {
              ...window.__lexoraLab,
              ttfb: navigation.responseStart,
              domContentLoaded: navigation.domContentLoadedEventEnd,
              scriptCount: scripts.length,
              scriptEncodedBytes: scripts.reduce((n, e) => n + e.encodedBodySize, 0),
            };
          });
          observations.push({
            profile: profile.name,
            route: route.startsWith("app/study/") ? "study-session" : route,
            run,
            ...metrics,
          });
          writeFileSync(
            join(output, "observations.partial.json"),
            JSON.stringify(observations, null, 2),
          );
          console.log(
            `${profile.name} ${observations.at(-1).route} run${run}: LCP=${Math.round(metrics.lcp ?? 0)}ms CLS=${metrics.cls.toFixed(4)} JS=${metrics.scriptEncodedBytes}B`,
          );
        } finally {
          await context.close();
        }
      }
  // Measure one real saved review per context; no client-side success inference.
  const reviews = [];
  for (let run = 0; run < (dashboardOnly ? 0 : 5); run++) {
    const context = await browser.newContext({ storageState });
    context.setDefaultTimeout(15000);
    try {
      const page = await context.newPage();
      await page.goto(`${origin}/es/app/study/${sessionId}`);
      await page.getByRole("button", { name: "Revelar respuesta", exact: true }).click();
      const response = page.waitForResponse(
        (r) =>
          new URL(r.url()).pathname === "/api/study/reviews" && r.request().method() === "POST",
      );
      const start = performance.now();
      await page.getByRole("button", { name: "Bien", exact: true }).click();
      const saved = await response;
      await saved.finished();
      if (!saved.ok()) throw Error(`Synthetic review was not confirmed: HTTP ${saved.status()}`);
      reviews.push(performance.now() - start);
    } finally {
      await context.close();
    }
  }
  const chunks = [];
  const savedLogs = await client
    .from("review_logs")
    .select("id", { count: "exact", head: true })
    .eq("study_session_id", sessionId);
  if (savedLogs.error || savedLogs.count !== reviews.length)
    throw Error("Saved review count did not match confirmed responses");
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (file.endsWith(".js")) {
        const body = readFileSync(file);
        chunks.push({
          file: file.replace(resolve(".next/static") + "\\", ""),
          bytes: body.length,
          gzipBytes: gzipSync(body).length,
        });
      }
    }
  }
  walk(resolve(".next/static"));
  const result = {
    provenance: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    buildId: readFileSync(".next/BUILD_ID", "utf8").trim(),
    sourceChanges: execFileSync("git", ["diff", "--name-only"], { encoding: "utf8" })
      .trim()
      .split("\n")
      .filter(Boolean),
    node: process.version,
    browser: browser.version(),
    conditions: {
      origin,
      cache: "disabled; fresh context",
      cpuSlowdown: 4,
      latencyMs: 40,
      downloadBitsPerSecond: 1600000,
      uploadBitsPerSecond: 750000,
      sampleRuns: 3,
      quietWindowMs: 2000,
      fieldData: false,
    },
    observations,
    reviewSaveMs: reviews,
    verifiedReviewCount: savedLogs.count,
    staticChunks: {
      count: chunks.length,
      totalGzipBytes: chunks.reduce((n, c) => n + c.gzipBytes, 0),
      largest: chunks.sort((a, b) => b.gzipBytes - a.gzipBytes).slice(0, 10),
      note: "All static chunks, not the cost of one route",
    },
  };
  writeFileSync(join(output, "summary.json"), JSON.stringify(result, null, 2));
  console.log(`Lab observations saved to ${output}`);
} finally {
  await browser?.close();
  if (owner) {
    if (!/^[0-9a-f-]{36}$/.test(owner) || !/^web-lab-[0-9a-f-]{36}@example\.com$/.test(email))
      throw Error("Unsafe lab cleanup identity");
    execFileSync(
      "docker",
      [
        "exec",
        "-i",
        "supabase_db_lexora",
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        `delete from auth.users where id='${owner}'::uuid and email='${email}';`,
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
  }
}
