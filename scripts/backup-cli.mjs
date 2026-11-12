import { createReadStream, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { createHash } from "node:crypto";
import { sealBackup, openBackup } from "./backup-envelope.mjs";

const [command, input, output, rawVersion] = process.argv.slice(2);
try {
  if (command === "schema-version" && input) {
    let copying = false,
      index = -1,
      version = 0,
      count = 0,
      bytes = 0;
    const records = [];
    const lines = createInterface({ input: createReadStream(input), crlfDelay: Infinity });
    for await (const line of lines) {
      if (!copying) {
        const match =
          /^COPY\s+(?:"supabase_migrations"|supabase_migrations)\.(?:"schema_migrations"|schema_migrations)\s+\(([^)]+)\)\s+FROM stdin;$/.exec(
            line,
          );
        if (match) {
          index = match[1]
            .split(",")
            .map((x) => x.trim().replaceAll('"', ""))
            .indexOf("version");
          if (index < 0) throw Error("Migration version column missing");
          copying = true;
        }
      } else {
        if (line === "\\.") break;
        const field = line.split("\t")[index];
        if (!/^\d{14}$/.test(field ?? "")) throw Error("Invalid migration history");
        version = Math.max(version, Number(field));
        count++;
        bytes += Buffer.byteLength(line);
        if (count > 10000 || bytes > 16 * 1024 * 1024)
          throw Error("Migration history exceeds the metadata budget");
        records.push(line);
      }
    }
    if (!version || !count) throw Error("The dump must include its migration history");
    console.log(
      JSON.stringify({
        version,
        count,
        sha256: createHash("sha256").update(records.sort().join("\n")).digest("hex"),
      }),
    );
  } else {
    if (
      !["seal", "open"].includes(command) ||
      !input ||
      !output ||
      !/^\d{14}$/.test(rawVersion ?? "")
    )
      throw Error(
        "Usage: backup-cli.mjs seal|open input output schemaVersion, or schema-version data.sql",
      );
    const version = Number(rawVersion),
      passphrase = process.env.LEXORA_BACKUP_PASSPHRASE;
    const result =
      command === "seal"
        ? await sealBackup({
            input,
            output,
            passphrase,
            schemaVersion: version,
            appVersion: JSON.parse(readFileSync("package.json", "utf8")).version,
          })
        : await openBackup({ input, output, passphrase, maxSchemaVersion: version });
    if (!result.ok) throw Error(`Backup refused: ${result.reason}`);
    console.log(
      JSON.stringify({
        ok: true,
        formatVersion: result.metadata.formatVersion,
        schemaVersion: result.metadata.schemaVersion,
      }),
    );
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
