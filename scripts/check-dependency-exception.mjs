import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
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

function reviewRuntimeReference(value, context) {
  assert.equal(typeof value, "string", `Invalid runtime reference: ${context}`);
  const file = value.replaceAll("\\", "/");
  // This separate Next copy remains bound to the reviewed lock and configuration.
  if (file.includes("/next/dist/compiled/picomatch/")) return 1;
  assert.ok(!GLOB_PACKAGE.test(file), `New glob dependency in ${context}; retriage required`);
  return 0;
}

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
      compiledNextFiles += reviewRuntimeReference(value, `production trace ${trace.name}`);
    }
  }
  return compiledNextFiles;
}

export function assertReviewedVercelOutput(output, functions, { nextVersion, runtime }) {
  assert.equal(output.version, 3, "Unsupported Vercel output version");
  assert.ok(Array.isArray(output.routes) && output.routes.length > 0, "Missing Vercel routes");
  assert.ok(functions.length > 0, "Missing Vercel functions");
  for (const route of [
    "api/health",
    "api/account/export",
    "api/account/delete",
    "api/auth/callback",
    "api/study/reviews",
  ])
    assert.ok(
      functions.some((fn) => fn.name === `${route}.func/.vc-config.json`),
      `Missing required Vercel function: ${route}`,
    );
  let assetReferencesChecked = 0,
    compiledNextReferences = 0;
  for (const fn of functions) {
    assert.equal(fn.config.runtime, runtime, `Unsupported Vercel runtime: ${fn.name}`);
    assert.equal(fn.config.framework?.slug, "nextjs", `Unexpected Vercel framework: ${fn.name}`);
    assert.equal(
      fn.config.framework?.version,
      nextVersion,
      `Unexpected Vercel Next version: ${fn.name}`,
    );
    assert.ok(fn.handlerExists, `Missing Vercel handler: ${fn.name}`);
    const map = fn.config.filePathMap;
    assert.ok(
      map && typeof map === "object" && !Array.isArray(map),
      `Invalid Vercel asset map: ${fn.name}`,
    );
    assert.ok(Object.keys(map).length > 0, `Empty Vercel asset map: ${fn.name}`);
    for (const [destination, source] of Object.entries(map)) {
      compiledNextReferences += reviewRuntimeReference(destination, fn.name);
      compiledNextReferences += reviewRuntimeReference(source, fn.name);
      assetReferencesChecked += 2;
    }
  }
  return { functionsChecked: functions.length, assetReferencesChecked, compiledNextReferences };
}

async function filesUnder(directory, ignoredNames = ["cache", "static"]) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignoredNames.includes(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await filesUnder(file, ignoredNames)));
    else if (entry.isFile()) result.push(file);
  }
  return result;
}

async function reviewProductionArtifacts(manifest) {
  const dist = path.join(ROOT, ".next");
  const required = JSON.parse(
    await readFile(path.join(dist, "required-server-files.json"), "utf8"),
  );
  assert.equal(required.version, 1, "Unsupported Next server manifest");
  assert.ok(
    required.config && typeof required.config === "object" && !Array.isArray(required.config),
    "Invalid Next server manifest",
  );
  // The adapter consumes Next's assets and emits Build Output API functions.
  // Use the effective build metadata, not environment guesses or stale output.
  if (required.config.adapterPath !== undefined) {
    assert.ok(
      typeof required.config.adapterPath === "string" && required.config.adapterPath.length > 0,
      "Invalid Next adapter metadata",
    );
    const outputRoot = path.join(dist, "output");
    const output = JSON.parse(await readFile(path.join(outputRoot, "config.json"), "utf8"));
    const functionsRoot = path.join(outputRoot, "functions");
    const functions = [];
    for (const file of await filesUnder(functionsRoot, [])) {
      if (path.basename(file) !== ".vc-config.json") continue;
      const config = JSON.parse(await readFile(file, "utf8"));
      const directory = path.dirname(file);
      assert.ok(
        typeof config.handler === "string" &&
          config.handler.length > 0 &&
          !path.isAbsolute(config.handler),
        "Unsafe Vercel handler",
      );
      const handler = path.resolve(directory, config.handler);
      assert.ok(handler.startsWith(directory + path.sep), "Unsafe Vercel handler");
      const handlerExists = await stat(handler)
        .then((entry) => entry.isFile())
        .catch((error) => {
          if (error.code === "ENOENT") return false;
          throw error;
        });
      functions.push({
        name: path.relative(functionsRoot, file).replaceAll("\\", "/"),
        config,
        handlerExists,
      });
    }
    return {
      productionArtifactKind: "vercel-build-output-v3",
      ...assertReviewedVercelOutput(output, functions, {
        nextVersion: manifest.dependencies.next,
        runtime: `nodejs${manifest.engines.node}`,
      }),
    };
  }
  const traces = [];
  for (const file of await filesUnder(dist))
    if (file.endsWith(".nft.json"))
      traces.push({ name: path.basename(file), ...JSON.parse(await readFile(file, "utf8")) });
  const productionServerTrace = process.env.NOW_BUILDER
    ? "next-minimal-server.js.nft.json"
    : "next-server.js.nft.json";
  return {
    productionArtifactKind: "next-nft",
    productionServerTrace,
    compiledNextFiles: assertReviewedTraces(traces, productionServerTrace),
  };
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
  const manifest = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));
  assertBuildCommands(manifest, JSON.parse(await readFile(path.join(ROOT, "vercel.json"), "utf8")));
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
  const artifacts = trace ? await reviewProductionArtifacts(manifest) : {};
  return {
    advisory: policy.advisory,
    expiresAt: policy.expiresAt,
    scopeMatched: true,
    registryChecked: registry,
    productionTracesChecked: trace && artifacts.productionArtifactKind === "next-nft",
    productionArtifactsChecked: trace,
    ...artifacts,
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
