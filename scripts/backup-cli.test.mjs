import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

async function run(content) {
  const dir = await mkdtemp(join(tmpdir(), "lexora-history-test-"));
  try {
    const input = join(dir, "data.sql");
    await writeFile(input, content);
    return spawnSync(process.execPath, ["scripts/backup-cli.mjs", "schema-version", input], {
      encoding: "utf8",
    });
  } finally {
    const target = resolve(dir);
    assert.equal(dirname(target), resolve(tmpdir()));
    assert.ok(basename(target).startsWith("lexora-history-test-"));
    await rm(target, { recursive: true, force: true });
  }
}
test("reads quoted COPY columns and compares canonical migration metadata independently of row order", async () => {
  const start =
    'COPY "supabase_migrations"."schema_migrations" ("name", "version", "statements") FROM stdin;\n';
  const rows = ["first\t20261111194000\t{}", "last\t20261111223000\t{}"];
  const a = await run(start + rows.join("\n") + "\n\\.\n"),
    b = await run(start + rows.reverse().join("\n") + "\n\\.\n");
  assert.equal(a.status, 0);
  assert.deepEqual(JSON.parse(a.stdout), JSON.parse(b.stdout));
  assert.equal(JSON.parse(a.stdout).version, 20261111223000);
  assert.equal(JSON.parse(a.stdout).count, 2);
});
test("refuses missing, malformed and unbounded migration metadata", async () => {
  assert.notEqual(
    (await run("COPY public.concepts (title) FROM stdin;\nSynthetic\n\\.\n")).status,
    0,
  );
  assert.notEqual(
    (
      await run(
        "COPY supabase_migrations.schema_migrations (version) FROM stdin;\nnot-a-version\n\\.\n",
      )
    ).status,
    0,
  );
  assert.notEqual(
    (
      await run(
        "COPY supabase_migrations.schema_migrations (version) FROM stdin;\n" +
          "20261111223000\n".repeat(10001) +
          "\\.\n",
      )
    ).status,
    0,
  );
});
