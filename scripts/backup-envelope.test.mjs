import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { sealBackup, openBackup } from "./backup-envelope.mjs";

const passphrase = "Synthetic key for backup envelope only";
const schemaVersion = 20261111223000;
test("invalid paths return typed refusals", async () => {
  assert.deepEqual(await sealBackup(), { ok: false, reason: "malformed" });
  assert.deepEqual(await openBackup(), { ok: false, reason: "malformed" });
});
async function fixture(run) {
  const dir = await mkdtemp(join(tmpdir(), "lexora-envelope-test-"));
  try {
    const input = join(dir, "source.dump"),
      archive = join(dir, "archive.lexorabak"),
      output = join(dir, "restored.dump");
    const content = Buffer.concat([
      Buffer.from("Synthetic\0\r\n\u00f1\u6f22\ud83d\udcda =1+1\n"),
      Buffer.alloc(1024 * 1024, 123),
    ]);
    await writeFile(input, content);
    assert.equal(
      (
        await sealBackup({
          input,
          output: archive,
          passphrase,
          schemaVersion,
          appVersion: "test",
          exportedAtUtc: "2026-11-11T00:00:00.000Z",
        })
      ).ok,
      true,
    );
    await run({ dir, input, archive, output, content });
    assert.equal(
      (await readdir(dir)).some((n) => n.includes(".pending-")),
      false,
    );
  } finally {
    // Only this exact mkdtemp-generated directory is removed.
    const target = resolve(dir);
    assert.equal(dirname(target), resolve(tmpdir()));
    assert.ok(basename(target).startsWith("lexora-envelope-test-"));
    await rm(target, { recursive: true, force: true });
  }
}
test("binary and Unicode payload round trips with stable bytes and authenticated metadata", () =>
  fixture(async ({ archive, output, content }) => {
    const result = await openBackup({
      input: archive,
      output,
      passphrase,
      maxSchemaVersion: schemaVersion,
    });
    assert.equal(result.ok, true);
    assert.deepEqual(await readFile(output), content);
    assert.equal(result.metadata.schemaVersion, schemaVersion);
    assert.equal(result.metadata.exportedAtUtc, "2026-11-11T00:00:00.000Z");
  }));
test("wrong keys publish no plaintext artifact", () =>
  fixture(async ({ dir, archive, output }) => {
    assert.deepEqual(
      await openBackup({
        input: archive,
        output,
        passphrase: "Wrong synthetic key of sufficient length",
        maxSchemaVersion: schemaVersion,
      }),
      { ok: false, reason: "integrity" },
    );
    assert.equal((await readdir(dir)).includes("restored.dump"), false);
  }));
for (const kind of ["ciphertext", "header", "truncate", "append"])
  test(`refuses ${kind} corruption without publishing plaintext`, () =>
    fixture(async ({ dir, archive, output }) => {
      let bytes = await readFile(archive);
      if (kind === "ciphertext") bytes[bytes.indexOf(10) + 20] ^= 1;
      if (kind === "header") {
        const at = bytes.indexOf(Buffer.from("test"));
        bytes[at] = 120;
      }
      if (kind === "truncate") bytes = bytes.subarray(0, bytes.length - 1);
      if (kind === "append") bytes = Buffer.concat([bytes, Buffer.from([0])]);
      await writeFile(archive, bytes);
      assert.equal(
        (await openBackup({ input: archive, output, passphrase, maxSchemaVersion: schemaVersion }))
          .ok,
        false,
      );
      assert.equal((await readdir(dir)).includes("restored.dump"), false);
    }));
test("refuses newer schema and unsupported formats before publishing", () =>
  fixture(async ({ archive, output }) => {
    assert.deepEqual(
      await openBackup({ input: archive, output, passphrase, maxSchemaVersion: schemaVersion - 1 }),
      { ok: false, reason: "newer-schema" },
    );
    const bytes = await readFile(archive);
    const changed = Buffer.from(
      bytes.toString("latin1").replace('"formatVersion":1', '"formatVersion":2'),
      "latin1",
    );
    await writeFile(archive, changed);
    assert.deepEqual(
      await openBackup({ input: archive, output, passphrase, maxSchemaVersion: schemaVersion }),
      { ok: false, reason: "unsupported-format" },
    );
  }));
test("refuses human exports and oversized headers", () =>
  fixture(async ({ archive, output }) => {
    await writeFile(archive, "title,meaning\nSynthetic,Meaning\n");
    assert.equal(
      (await openBackup({ input: archive, output, passphrase, maxSchemaVersion: schemaVersion }))
        .ok,
      false,
    );
    await writeFile(archive, "x".repeat(16385) + "\n" + Buffer.alloc(32));
    assert.deepEqual(
      await openBackup({ input: archive, output, passphrase, maxSchemaVersion: schemaVersion }),
      { ok: false, reason: "malformed" },
    );
  }));
test("never replaces an existing source or destination", () =>
  fixture(async ({ input, archive, output }) => {
    const previous = await readFile(archive);
    assert.deepEqual(
      await sealBackup({ input, output: archive, passphrase, schemaVersion, appVersion: "test" }),
      { ok: false, reason: "exists" },
    );
    assert.deepEqual(await readFile(archive), previous);
    await writeFile(output, "Existing file must survive");
    assert.deepEqual(
      await openBackup({ input: archive, output, passphrase, maxSchemaVersion: schemaVersion }),
      { ok: false, reason: "exists" },
    );
    assert.equal(await readFile(output, "utf8"), "Existing file must survive");
  }));
