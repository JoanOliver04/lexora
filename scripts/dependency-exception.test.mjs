import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  assertExceptionScope,
  assertBuildCommands,
  assertNoNewGlobUse,
  assertReviewedRegistry,
  assertReviewedTraces,
  REVIEW_FILES,
} from "./check-dependency-exception.mjs";

const hashes = Object.fromEntries(REVIEW_FILES.map((file) => [file, "reviewed-digest"]));
const policy = {
  advisory: "GHSA-fc5q-39xc-vjpf",
  cve: "CVE-2026-112366",
  versions: ["2.3.2", "4.0.7"],
  registryVersion: "4.0.7",
  reviewedAt: "2026-11-17T00:00:00Z",
  expiresAt: "2026-12-01T00:00:00Z",
  fingerprints: hashes,
};
const now = new Date("2026-11-18T00:00:00Z");

async function policyFixture(t) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const fixture = await mkdtemp(path.join(os.tmpdir(), "lexora-policy-"));
  assert.equal(path.dirname(fixture), path.resolve(os.tmpdir()));
  assert.ok(path.basename(fixture).startsWith("lexora-policy-"));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  await mkdir(path.join(fixture, "scripts"));
  await mkdir(path.join(fixture, "src"));
  for (const file of [
    ...REVIEW_FILES,
    "scripts/check-dependency-exception.mjs",
    "scripts/dependency-exception.json",
  ])
    await copyFile(path.join(root, file), path.join(fixture, file));
  const run = (...args) =>
    promisify(execFile)(
      process.execPath,
      [path.join(fixture, "scripts/check-dependency-exception.mjs"), ...args],
      {
        timeout: 10000,
      },
    );
  return { fixture, run };
}

test("the build policy accepts Vercel's JSON rewrite while rejecting changed configuration", async (t) => {
  const { fixture, run } = await policyFixture(t);
  const configPath = path.join(fixture, "vercel.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  // Replay the exact compact-plus-newline serialization identified by the build log.
  await writeFile(configPath, JSON.stringify(config) + "\n");
  const { stdout } = await run();
  assert.equal(JSON.parse(stdout).scopeMatched, true);
  await writeFile(configPath, JSON.stringify(config, null, 4) + "\r\n");
  assert.equal(JSON.parse((await run()).stdout).scopeMatched, true);
  for (const changed of [
    { ...config, buildCommand: "next build" },
    { ...config, regions: ["iad1"] },
    { ...config, git: { deploymentEnabled: { "**": true } } },
    { ...config, newOption: true },
  ]) {
    await writeFile(configPath, JSON.stringify(changed) + "\n");
    await assert.rejects(run, (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /scope changed: vercel\.json/);
      assert.equal(error.stdout, "");
      return true;
    });
  }
  await writeFile(configPath, "{invalid");
  await assert.rejects(run, (error) => {
    assert.equal(error.code, 1);
    assert.equal(error.stdout, "");
    return true;
  });
});

test("the CLI validates Vercel adapter artifacts instead of requiring an NFT", async (t) => {
  const { fixture, run } = await policyFixture(t);
  const next = path.join(fixture, ".next");
  const output = path.join(next, "output");
  await mkdir(output, { recursive: true });
  await writeFile(
    path.join(next, "required-server-files.json"),
    JSON.stringify({
      version: 1,
      config: { adapterPath: "/builder/adapter/index.js" },
    }),
  );
  const outputConfig = { version: 3, routes: [{ handle: "filesystem" }] };
  const configPath = path.join(output, "config.json");
  await writeFile(configPath, JSON.stringify(outputConfig));
  const functions = [
    "api/health",
    "api/account/export",
    "api/account/delete",
    "api/auth/callback",
    "api/study/reviews",
  ];
  const functionConfig = {
    framework: { slug: "nextjs", version: "16.4.6" },
    runtime: "nodejs24.x",
    handler: "___next_launcher.cjs",
    filePathMap: { "node_modules/server-only/index.js": "node_modules/server-only/index.js" },
  };
  for (const name of functions) {
    const dir = path.join(output, "functions", name + ".func");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, ".vc-config.json"), JSON.stringify(functionConfig));
    await writeFile(path.join(dir, functionConfig.handler), "// Fixture; never executed.\n");
  }
  const result = JSON.parse((await run("--trace")).stdout);
  assert.equal(result.productionArtifactsChecked, true);
  assert.equal(result.productionTracesChecked, false);
  assert.equal(result.productionArtifactKind, "vercel-build-output-v3");
  assert.equal(result.functionsChecked, 5);
  assert.equal(result.assetReferencesChecked, 10);
  const target = path.join(output, "functions/api/health.func/.vc-config.json");
  async function rejected(config, message) {
    await writeFile(target, JSON.stringify(config));
    await assert.rejects(
      () => run("--trace"),
      (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, message);
        assert.equal(error.stdout, "");
        return true;
      },
    );
  }
  await rejected({ ...functionConfig, filePathMap: {} }, /Empty Vercel asset map/);
  await rejected({ ...functionConfig, filePathMap: { safe: 42 } }, /Invalid runtime reference/);
  await rejected(
    { ...functionConfig, filePathMap: { "node_modules/picomatch/index.js": "safe.js" } },
    /New glob dependency/,
  );
  await rejected(
    { ...functionConfig, filePathMap: { "safe.js": "node_modules/picomatch/index.js" } },
    /New glob dependency/,
  );
  await rejected({ ...functionConfig, runtime: "edge" }, /Unsupported Vercel runtime/);
  await rejected({ ...functionConfig, handler: "../escape.js" }, /Unsafe Vercel handler/);
  await rejected({ ...functionConfig, handler: "missing.js" }, /Missing Vercel handler/);
  await rejected(
    { ...functionConfig, framework: { slug: "nextjs", version: "other" } },
    /Unexpected Vercel Next version/,
  );
  await rejected(
    { ...functionConfig, framework: { slug: "other", version: "16.4.6" } },
    /Unexpected Vercel framework/,
  );
  await writeFile(target, JSON.stringify(functionConfig));
  await writeFile(configPath, JSON.stringify({ ...outputConfig, version: 4 }));
  await assert.rejects(() => run("--trace"), /Unsupported Vercel output version/);
  await writeFile(configPath, JSON.stringify(outputConfig));
  await writeFile(target, "{");
  await assert.rejects(() => run("--trace"));
  await writeFile(target, JSON.stringify(functionConfig));
  const missing = path.join(output, "functions/api/account/delete.func/.vc-config.json");
  await rm(missing);
  await assert.rejects(() => run("--trace"), /Missing required Vercel function/);
  await writeFile(missing, JSON.stringify(functionConfig));
  // Valid old adapter output cannot satisfy a later build without an adapter.
  await writeFile(
    path.join(next, "required-server-files.json"),
    JSON.stringify({ version: 1, config: {} }),
  );
  await assert.rejects(() => run("--trace"), /Missing production server trace/);
});

test("direct and Vercel builds cannot omit the policy checkpoints", () => {
  const manifest = {
    scripts: { build: "pnpm security:policy && next build && pnpm security:policy --trace" },
  };
  assertBuildCommands(manifest, { buildCommand: "pnpm build" });
  assert.throws(
    () => assertBuildCommands({ scripts: { build: "next build" } }, { buildCommand: "pnpm build" }),
    /before and after/,
  );
  assert.throws(() => assertBuildCommands(manifest, { buildCommand: "next build" }), /Vercel/);
});

test("only the exact reviewed scope passes before expiration", () =>
  assert.doesNotThrow(() => assertExceptionScope(policy, hashes, now)));
test("expiry fails at its boundary rather than silently renewing", () =>
  assert.throws(() => assertExceptionScope(policy, hashes, new Date(policy.expiresAt)), /expired/));
test("review cannot become an indefinite or different-advisory bypass", () => {
  assert.throws(
    () => assertExceptionScope({ ...policy, expiresAt: "2027-01-01" }, hashes, now),
    /fourteen days/,
  );
  assert.throws(
    () => assertExceptionScope({ ...policy, advisory: "GHSA-other" }, hashes, now),
    /Only the reviewed/,
  );
});
test("a changed lock or config requires a new reachability review", () => {
  for (const file of REVIEW_FILES)
    assert.throws(
      () => assertExceptionScope(policy, { ...hashes, [file]: "changed" }, now),
      /scope changed/,
    );
});
test("omitting a reviewed boundary fails closed", () =>
  assert.throws(
    () => assertExceptionScope({ ...policy, fingerprints: {} }, {}, now),
    /Incomplete/,
  ));
test("a new upstream version or malformed registry response stops the exception", () => {
  assertReviewedRegistry({ name: "picomatch", "dist-tags": { latest: "4.0.7" } }, policy);
  assert.throws(
    () => assertReviewedRegistry({ name: "picomatch", "dist-tags": { latest: "4.0.8" } }, policy),
    /New upstream/,
  );
  assert.throws(() => assertReviewedRegistry({}, policy), /Unexpected/);
});
test("new direct or intermediary glob references require review", () => {
  assertNoNewGlobUse([{ file: "view.ts", code: "const label = 'English';" }]);
  for (const name of ["picomatch", "micromatch", "tinyglobby", "fast-glob", "@parcel/watcher"])
    assert.throws(
      () => assertNoNewGlobUse([{ file: "route.ts", code: `import matcher from '${name}'` }]),
      /reachability/,
    );
});
test("reviewed Next compiled copy is distinguished from new standalone runtime packages", () => {
  const root = {
    name: "next-server.js.nft.json",
    files: ["../node_modules/next/dist/compiled/picomatch/index.js"],
  };
  assert.equal(assertReviewedTraces([root]), 1);
  assert.throws(
    () =>
      assertReviewedTraces([
        {
          ...root,
          files: [
            ...root.files,
            "../node_modules/.pnpm/picomatch@4.0.7/node_modules/picomatch/lib/parse.js",
          ],
        },
      ]),
    /New glob dependency/,
  );
  assert.throws(() => assertReviewedTraces([]), /Missing production/);
  assert.throws(() => assertReviewedTraces([{ ...root, files: null }]), /Invalid trace/);
});

test("each build mode requires its own server trace and still rejects new glob dependencies", () => {
  const full = { name: "next-server.js.nft.json", files: [] };
  const minimal = { name: "next-minimal-server.js.nft.json", files: [] };
  assert.equal(assertReviewedTraces([minimal], minimal.name), 0);
  assert.throws(() => assertReviewedTraces([minimal]), /Missing production/);
  assert.throws(() => assertReviewedTraces([full], minimal.name), /Missing production/);
  assert.throws(() => assertReviewedTraces([minimal], "arbitrary.json"), /Unsupported/);
  assert.throws(
    () =>
      assertReviewedTraces(
        [{ ...minimal, files: ["../node_modules/picomatch/index.js"] }],
        minimal.name,
      ),
    /New glob dependency/,
  );
});
