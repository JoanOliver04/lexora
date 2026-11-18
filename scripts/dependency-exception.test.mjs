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

test("the build policy accepts Vercel's JSON rewrite while rejecting changed configuration", async (t) => {
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
  const configPath = path.join(fixture, "vercel.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const run = () =>
    promisify(execFile)(
      process.execPath,
      [path.join(fixture, "scripts/check-dependency-exception.mjs")],
      {
        timeout: 10000,
      },
    );
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
