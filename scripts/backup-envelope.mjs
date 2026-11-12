/** Streaming, authenticated operational backup envelope. No database/network access. */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
  scrypt,
} from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { appendFile, link, open, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";

const derive = promisify(scrypt),
  MAX_BYTES = 8 * 1024 ** 3,
  MAX_HEADER = 16384;
const refuse = (reason) => {
  throw Object.assign(Error("Backup refused"), { backupReason: reason });
};
const hex = /^[a-f0-9]{64}$/;
async function digest(file) {
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(file)) hash.update(bytes);
  return hash.digest("hex");
}
function secret(value) {
  if (typeof value !== "string" || value.length < 16 || value.length > 4096) refuse("invalid-key");
}
async function key(passphrase, salt) {
  return derive(passphrase, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 ** 2 });
}
function stagePath(output) {
  return join(dirname(output), `.${basename(output)}.pending-${randomUUID()}`);
}
async function flush(file) {
  const handle = await open(file, "r+");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}
/** A same-directory hard link publishes atomically and refuses an existing destination. */
async function publish(stage, output) {
  await flush(stage);
  await link(stage, output);
}
async function clean(file) {
  await unlink(file).catch(() => undefined);
}
function failure(error) {
  return { ok: false, reason: error?.backupReason ?? (error?.code === "EEXIST" ? "exists" : "io") };
}

export async function sealBackup({
  input,
  output,
  passphrase,
  schemaVersion,
  appVersion,
  exportedAtUtc = new Date().toISOString(),
} = {}) {
  let stage, derived;
  try {
    if (typeof input !== "string" || typeof output !== "string") refuse("malformed");
    stage = stagePath(output);
    secret(passphrase);
    const source = await stat(input);
    if (!source.isFile() || source.size < 1 || source.size > MAX_BYTES) refuse("size");
    if (
      !Number.isSafeInteger(schemaVersion) ||
      schemaVersion < 1 ||
      typeof appVersion !== "string" ||
      appVersion.length > 64 ||
      !appVersion.length ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(exportedAtUtc) ||
      Number.isNaN(Date.parse(exportedAtUtc))
    )
      refuse("malformed");
    const payloadSha256 = await digest(input),
      salt = randomBytes(32),
      iv = randomBytes(12);
    const metadata = {
      formatVersion: 1,
      schemaVersion,
      appVersion,
      exportedAtUtc,
      payloadSha256,
      payloadBytes: source.size,
      cipher: "aes-256-gcm",
      kdf: "scrypt-32768-8-1",
      salt: salt.toString("base64"),
      iv: iv.toString("base64"),
    };
    const header = Buffer.from(JSON.stringify(metadata));
    derived = await key(passphrase, salt);
    const cipher = createCipheriv("aes-256-gcm", derived, iv);
    cipher.setAAD(header);
    await writeFile(stage, Buffer.concat([header, Buffer.from("\n")]), { flag: "wx", mode: 0o600 });
    const secondHash = createHash("sha256");
    let bytes = 0;
    const meter = new Transform({
      transform(chunk, _encoding, done) {
        bytes += chunk.length;
        secondHash.update(chunk);
        done(null, chunk);
      },
    });
    await pipeline(
      createReadStream(input),
      meter,
      cipher,
      createWriteStream(stage, { flags: "a" }),
    );
    if (bytes !== source.size || secondHash.digest("hex") !== payloadSha256)
      refuse("source-changed");
    await appendFile(stage, cipher.getAuthTag());
    await publish(stage, output);
    return { ok: true, metadata };
  } catch (error) {
    return failure(error);
  } finally {
    derived?.fill(0);
    if (stage) await clean(stage);
  }
}

async function headerOf(input, maxSchemaVersion) {
  const size = (await stat(input)).size;
  if (size < 32 || size > MAX_BYTES + MAX_HEADER + 17) refuse("size");
  const handle = await open(input, "r");
  let header, metadata;
  try {
    const bytes = Buffer.alloc(Math.min(size, MAX_HEADER + 1));
    const read = await handle.read(bytes, 0, bytes.length, 0);
    const end = bytes.subarray(0, read.bytesRead).indexOf(10);
    if (end < 1 || end > MAX_HEADER) refuse("malformed");
    header = bytes.subarray(0, end);
    try {
      metadata = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(header));
    } catch {
      refuse("malformed");
    }
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) refuse("malformed");
    if (metadata.formatVersion !== 1) refuse("unsupported-format");
    if (!Number.isSafeInteger(metadata.schemaVersion) || metadata.schemaVersion < 1)
      refuse("malformed");
    if (metadata.schemaVersion > maxSchemaVersion) refuse("newer-schema");
    if (
      metadata.cipher !== "aes-256-gcm" ||
      metadata.kdf !== "scrypt-32768-8-1" ||
      !hex.test(metadata.payloadSha256) ||
      !Number.isSafeInteger(metadata.payloadBytes) ||
      metadata.payloadBytes < 1 ||
      metadata.payloadBytes > MAX_BYTES ||
      size !== header.length + 1 + metadata.payloadBytes + 16 ||
      typeof metadata.appVersion !== "string" ||
      metadata.appVersion.length < 1 ||
      metadata.appVersion.length > 64 ||
      typeof metadata.exportedAtUtc !== "string" ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(metadata.exportedAtUtc) ||
      Number.isNaN(Date.parse(metadata.exportedAtUtc))
    )
      refuse("malformed");
    for (const [field, length] of [
      ["salt", 32],
      ["iv", 12],
    ]) {
      if (typeof metadata[field] !== "string") refuse("malformed");
      const decoded = Buffer.from(metadata[field], "base64");
      if (decoded.length !== length || decoded.toString("base64") !== metadata[field])
        refuse("malformed");
    }
    const tag = Buffer.alloc(16);
    await handle.read(tag, 0, 16, size - 16);
    return { header, metadata, tag, start: header.length + 1, end: size - 17 };
  } finally {
    await handle.close();
  }
}
/** Decrypt only to a new staging artifact; publish after GCM and checksum both verify. */
export async function openBackup({ input, output, passphrase, maxSchemaVersion } = {}) {
  let stage, derived;
  try {
    if (typeof input !== "string" || typeof output !== "string") refuse("malformed");
    stage = stagePath(output);
    secret(passphrase);
    if (!Number.isSafeInteger(maxSchemaVersion) || maxSchemaVersion < 1) refuse("malformed");
    const { header, metadata, tag, start, end } = await headerOf(input, maxSchemaVersion);
    derived = await key(passphrase, Buffer.from(metadata.salt, "base64"));
    const decipher = createDecipheriv("aes-256-gcm", derived, Buffer.from(metadata.iv, "base64"));
    decipher.setAAD(header);
    decipher.setAuthTag(tag);
    const hash = createHash("sha256");
    let bytes = 0;
    const meter = new Transform({
      transform(chunk, _encoding, done) {
        bytes += chunk.length;
        hash.update(chunk);
        done(null, chunk);
      },
    });
    try {
      await pipeline(
        createReadStream(input, { start, end }),
        decipher,
        meter,
        createWriteStream(stage, { flags: "wx", mode: 0o600 }),
      );
    } catch (error) {
      if (error?.code && /^E[A-Z]+$/.test(error.code)) throw error;
      refuse("integrity");
    }
    if (bytes !== metadata.payloadBytes || hash.digest("hex") !== metadata.payloadSha256)
      refuse("integrity");
    await publish(stage, output);
    return { ok: true, metadata };
  } catch (error) {
    return failure(error);
  } finally {
    derived?.fill(0);
    if (stage) await clean(stage);
  }
}
