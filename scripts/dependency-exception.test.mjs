import test from "node:test";
import assert from "node:assert/strict";
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
