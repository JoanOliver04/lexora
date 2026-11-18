import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const REVIEW_FILES = [
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "next.config.ts",
  "vitest.config.mts",
  "eslint.config.mjs",
  "package.json",
  "vercel.json",
];
const GLOB_PACKAGE = /picomatch|micromatch|tinyglobby|fast-glob|@parcel\/watcher/;

export function assertExceptionScope(policy, hashes, now = new Date()) {
  assert.equal(
    policy.advisory,
    "GHSA-fc5q-39xc-vjpf",
    "Only the reviewed advisory may be excepted",
  );
  assert.equal(policy.cve, "CVE-2026-112366");
  assert.deepEqual(policy.versions, ["2.3.2", "4.0.7"]);
  assert.equal(policy.registryVersion, "4.0.7");
  const reviewed = Date.parse(policy.reviewedAt);
  const expires = Date.parse(policy.expiresAt);
  assert.ok(
    Number.isFinite(reviewed) && Number.isFinite(expires) && Number.isFinite(now.getTime()),
    "Invalid exception dates",
  );
  assert.ok(
    expires > reviewed && expires - reviewed <= 14 * 86400000,
    "Exception may last at most fourteen days",
  );
  assert.ok(
    now.getTime() >= reviewed && now.getTime() < expires,
    "Dependency exception expired or clock precedes review; retriage required",
  );
  assert.deepEqual(
    Object.keys(policy.fingerprints).sort(),
    [...REVIEW_FILES].sort(),
    "Incomplete review fingerprint",
  );
  for (const file of REVIEW_FILES)
    assert.equal(
      hashes[file],
      policy.fingerprints[file],
      `Dependency/config scope changed: ${file}; retriage required`,
    );
}

export function assertReviewedRegistry(metadata, policy) {
  assert.equal(metadata.name, "picomatch", "Unexpected registry package");
  assert.equal(
    metadata["dist-tags"]?.latest,
    policy.registryVersion,
    "New upstream release: remove/review the temporary exception",
  );
}

export function assertBuildCommands(manifest, vercel) {
  assert.equal(
    manifest.scripts?.build,
    "pnpm security:policy && next build && pnpm security:policy --trace",
    "The build command must enforce policy before and after compilation",
  );
  assert.equal(vercel.buildCommand, "pnpm build", "Vercel must use the guarded build command");
}

export function assertNoNewGlobUse(sources) {
  for (const { file, code } of sources)
    assert.ok(
      !GLOB_PACKAGE.test(code),
      `New glob reference in ${file}; reachability review required`,
    );
}

export function assertReviewedTraces(traces, serverTrace = "next-server.js.nft.json") {
  assert.ok(
    ["next-server.js.nft.json", "next-minimal-server.js.nft.json"].includes(serverTrace),
    "Unsupported production server trace",
  );
  assert.ok(
    traces.some((trace) => trace.name === serverTrace),
    "Missing production server trace",
  );
  let compiledNextFiles = 0;
  for (const trace of traces) {
    assert.ok(Array.isArray(trace.files), `Invalid trace: ${trace.name}`);
    for (const value of trace.files) {
      assert.equal(typeof value, "string");
      const file = value.replaceAll("\\", "/");
      // This separate Next copy was reviewed with static/default image patterns.
      if (file.includes("/next/dist/compiled/picomatch/")) {
        compiledNextFiles++;
        continue;
      }
      assert.ok(
        !GLOB_PACKAGE.test(file),
        `New glob dependency in production trace ${trace.name}; retriage required`,
      );
    }
  }
  return compiledNextFiles;
}

async function filesUnder(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (["cache", "static"].includes(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await filesUnder(file)));
    else if (entry.isFile()) result.push(file);
  }
  return result;
}

export async function verifyDependencyException({ registry = false, trace = false } = {}) {
  const policy = JSON.parse(
    await readFile(path.join(ROOT, "scripts/dependency-exception.json"), "utf8"),
  );
  const hashes = {};
  for (const file of REVIEW_FILES) {
    const source = await readFile(path.join(ROOT, file), "utf8");
    // Vercel rewrites this JSON before build; compare its values, not indentation.
    const normalized =
      file === "vercel.json"
        ? JSON.stringify(JSON.parse(source)) + "\n"
        : source.replaceAll("\r\n", "\n");
    hashes[file] = createHash("sha256").update(normalized).digest("hex");
  }
  assertExceptionScope(policy, hashes);
  assertBuildCommands(
    JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8")),
    JSON.parse(await readFile(path.join(ROOT, "vercel.json"), "utf8")),
  );
  const sources = [];
  for (const file of await filesUnder(path.join(ROOT, "src")))
    if (/\.tsx?$/.test(file))
      sources.push({ file: path.relative(ROOT, file), code: await readFile(file, "utf8") });
  assertNoNewGlobUse(sources);
  if (registry) {
    const response = await fetch("https://registry.npmjs.org/picomatch", {
      signal: AbortSignal.timeout(15000),
    });
    assert.ok(response.ok, `Registry check failed: HTTP ${response.status}`);
    assertReviewedRegistry(await response.json(), policy);
  }
  let compiledNextFiles;
  // Match Next's hasNextSupport flag: the provider runs its minimal server.
  const productionServerTrace = process.env.NOW_BUILDER
    ? "next-minimal-server.js.nft.json"
    : "next-server.js.nft.json";
  if (trace) {
    const traces = [];
    for (const file of await filesUnder(path.join(ROOT, ".next")))
      if (file.endsWith(".nft.json"))
        traces.push({ name: path.basename(file), ...JSON.parse(await readFile(file, "utf8")) });
    compiledNextFiles = assertReviewedTraces(traces, productionServerTrace);
  }
  return {
    advisory: policy.advisory,
    expiresAt: policy.expiresAt,
    scopeMatched: true,
    registryChecked: registry,
    productionTracesChecked: trace,
    ...(trace ? { compiledNextFiles, productionServerTrace } : {}),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    assert.ok(
      args.every((arg) => ["--registry", "--trace"].includes(arg)),
      "Unknown policy check argument",
    );
    process.stdout.write(
      `${JSON.stringify(await verifyDependencyException({ registry: args.includes("--registry"), trace: args.includes("--trace") }))}\n`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Dependency exception check failed");
    process.exitCode = 1;
  }
}
