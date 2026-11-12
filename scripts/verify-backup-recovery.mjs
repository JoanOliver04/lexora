/** Full synthetic LOCAL rehearsal. Never connects to the linked hosted project. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { sealBackup, openBackup } from "./backup-envelope.mjs";

const runId = randomUUID().replaceAll("-", ""),
  root = resolve("."),
  container = "supabase_db_lexora";
const source = `lexora_recovery_source_${runId}`,
  target = `lexora_recovery_target_${runId}`;
const artifacts = mkdtempSync(join(tmpdir(), "lexora-recovery-"));
const databases = [],
  helpers = [],
  secretValues = [];
const jwtSecret = randomBytes(48).toString("hex"),
  encryptionKey = randomBytes(32).toString("hex"),
  passphrase = randomBytes(48).toString("base64url");
secretValues.push(jwtSecret, encryptionKey, passphrase);
const jwtHeader = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
const jwtPayload = Buffer.from(
  JSON.stringify({
    role: "anon",
    aud: "authenticated",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  }),
).toString("base64url");
const unsigned = `${jwtHeader}.${jwtPayload}`;
const anonKey = `${unsigned}.${createHmac("sha256", jwtSecret).update(unsigned).digest("base64url")}`;
secretValues.push(anonKey);
let phase = "preflight";
function docker(args, input) {
  const result = spawnSync("docker", args, {
    input,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    timeout: 60000,
  });
  if (result.status !== 0) {
    let diagnostic = String(result.stderr || result.error?.message || "Local helper failed");
    for (const value of secretValues)
      if (value) diagnostic = diagnostic.replaceAll(value, "[redacted]");
    diagnostic = diagnostic.replace(/postgres(?:ql)?:\/\/\S+/g, "[redacted database URL]");
    writeFileSync(join(artifacts, "diagnostic.log"), `${phase}\n${diagnostic}`, { mode: 0o600 });
    throw Error(`Recovery rehearsal failed at ${phase}; local diagnostic retained`);
  }
  return result.stdout.trim();
}
function sql(database, query) {
  if (database !== "postgres" && ![source, target].includes(database))
    throw Error("Unsafe database target");
  return docker(
    [
      "exec",
      "-i",
      container,
      "psql",
      "-X",
      "-q",
      "-t",
      "-A",
      "-U",
      "supabase_admin",
      "-d",
      database,
      "-v",
      "ON_ERROR_STOP=1",
    ],
    query,
  );
}
function inspect(name) {
  return JSON.parse(docker(["inspect", name]))[0];
}
function envOf(config) {
  return Object.fromEntries(
    config.Config.Env.map((line) => {
      const at = line.indexOf("=");
      return [line.slice(0, at), line.slice(at + 1)];
    }),
  );
}
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
function createDatabase(name) {
  if (!/^lexora_recovery_(source|target)_[a-f0-9]{32}$/.test(name))
    throw Error("Unsafe disposable name");
  sql("postgres", `create database ${name} owner postgres template template0;`);
  databases.push(name);
}
async function helper(kind, image, env, port) {
  const name = `lexora-recovery-${kind}-${runId}`,
    file = join(artifacts, `${kind}.env`);
  writeFileSync(
    file,
    Object.entries(env)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n"),
    { mode: 0o600 },
  );
  helpers.push(name);
  try {
    docker([
      "run",
      "-d",
      "--pull=never",
      "--label",
      `lexora.recovery.run=${runId}`,
      "--name",
      name,
      "--network",
      "supabase_network_lexora",
      "-p",
      `127.0.0.1::${port}`,
      "--env-file",
      file,
      image,
    ]);
  } finally {
    unlinkSync(file);
  }
  const config = inspect(name),
    binding = config.NetworkSettings.Ports[`${port}/tcp`]?.[0];
  if (!binding || binding.HostIp !== "127.0.0.1") throw Error("Helper is not loopback bound");
  const origin = `http://127.0.0.1:${binding.HostPort}`;
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      const response = await fetch(origin + (kind.includes("auth") ? "/health" : "/"), {
        signal: AbortSignal.timeout(1000),
      });
      await response.body?.cancel();
      if (response.ok) return origin;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  let log = docker(["logs", name]);
  for (const secret of secretValues) log = log.replaceAll(secret, "[redacted]");
  writeFileSync(
    join(artifacts, "startup.log"),
    log.replace(/postgres(?:ql)?:\/\/\S+/g, "[redacted database URL]"),
    { mode: 0o600 },
  );
  throw Error(`Local ${kind} helper did not become ready`);
}
function authEnv(url) {
  return {
    GOTRUE_API_HOST: "0.0.0.0",
    GOTRUE_API_PORT: "9999",
    API_EXTERNAL_URL: "http://localhost",
    GOTRUE_SITE_URL: "http://localhost",
    GOTRUE_DB_DRIVER: "postgres",
    GOTRUE_DB_DATABASE_URL: url,
    GOTRUE_DB_MAX_POOL_SIZE: "2",
    GOTRUE_JWT_SECRET: jwtSecret,
    GOTRUE_JWT_EXP: "3600",
    GOTRUE_JWT_AUD: "authenticated",
    GOTRUE_JWT_DEFAULT_GROUP_NAME: "authenticated",
    GOTRUE_JWT_ADMIN_ROLES: "service_role",
    GOTRUE_DB_ENC_KEY: encryptionKey,
    GOTRUE_DISABLE_SIGNUP: "false",
    GOTRUE_EXTERNAL_EMAIL_ENABLED: "true",
    GOTRUE_MAILER_AUTOCONFIRM: "true",
    GOTRUE_MFA_TOTP_ENROLL_ENABLED: "true",
    GOTRUE_MFA_TOTP_VERIFY_ENABLED: "true",
    GOTRUE_MFA_MAX_ENROLLED_FACTORS: "10",
    LOG_LEVEL: "error",
  };
}
function api(authOrigin, restOrigin) {
  return createClient(authOrigin, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) => {
        const url = new URL(
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
        );
        let destination;
        if (url.origin !== authOrigin) throw Error("Unexpected recovery API origin");
        if (url.pathname.startsWith("/auth/v1/"))
          destination = new URL(url.pathname.slice("/auth/v1".length) + url.search, authOrigin);
        else if (restOrigin && url.pathname.startsWith("/rest/v1/"))
          destination = new URL(url.pathname.slice("/rest/v1".length) + url.search, restOrigin);
        else throw Error("Unexpected recovery API path");
        return fetch(destination, { ...init, signal: init?.signal ?? AbortSignal.timeout(15000) });
      },
    },
  });
}
async function checked(query) {
  const { data, error } = await query;
  if (error) throw Error(`Synthetic API operation failed at ${phase}`);
  return data;
}
function totp(secret) {
  let bits = 0,
    value = 0;
  const bytes = [];
  for (const char of secret.toUpperCase().replace(/=+$/, "")) {
    const n = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(char);
    if (n < 0) throw Error("Invalid synthetic TOTP");
    value = (value << 5) | n;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 255);
    }
  }
  const time = Buffer.alloc(8);
  time.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hash = createHmac("sha1", Buffer.from(bytes)).update(time).digest(),
    offset = hash[19] & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, "0");
}
function fingerprint(database) {
  const tables = JSON.parse(
    sql(
      database,
      "select coalesce(json_agg(x order by schemaname,tablename),'[]') from(select schemaname,tablename from pg_tables where schemaname in('auth','public','supabase_migrations'))x;",
    ),
  );
  const hash = createHash("sha256");
  for (const t of tables) {
    if (!/^[a-z_]+$/.test(t.schemaname) || !/^\w+$/.test(t.tablename))
      throw Error("Unexpected fixture table name");
    const rows = sql(
      database,
      `set timezone='UTC';select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]') from "${t.schemaname}"."${t.tablename}" r;`,
    );
    hash.update(`${t.schemaname}.${t.tablename}\n${rows}\n`);
  }
  return { tables: tables.length, sha256: hash.digest("hex") };
}
try {
  console.log("Recovery rehearsal: isolated local Auth, database and REST only");
  const authConfig = inspect("supabase_auth_lexora"),
    restConfig = inspect("supabase_rest_lexora");
  assert.ok(authConfig.NetworkSettings.Networks.supabase_network_lexora);
  assert.ok(restConfig.NetworkSettings.Networks.supabase_network_lexora);
  const authUrl = new URL(envOf(authConfig).GOTRUE_DB_DATABASE_URL),
    restUrl = new URL(envOf(restConfig).PGRST_DB_URI);
  if (
    authUrl.hostname !== container ||
    restUrl.hostname !== container ||
    authUrl.pathname !== "/postgres" ||
    restUrl.pathname !== "/postgres"
  )
    throw Error("Local database identity mismatch");
  secretValues.push(authUrl.password, restUrl.password);
  phase = "bootstrap source";
  createDatabase(source);
  sql(
    source,
    `create schema auth authorization supabase_auth_admin;grant create on database ${source} to supabase_auth_admin;`,
  );
  authUrl.pathname = `/${source}`;
  const sourceAuth = await helper(
    "source-auth",
    authConfig.Config.Image,
    authEnv(authUrl.href),
    9999,
  );
  const authFunctions = sql(
    "postgres",
    "select pg_get_functiondef(p.oid)||';' from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='auth' and p.proname in('uid','jwt','role') order by p.proname;",
  );
  sql(
    source,
    authFunctions +
      "\ngrant usage on schema public,auth to anon,authenticated,service_role,postgres;grant all on all tables in schema auth to postgres;grant all on all sequences in schema auth to postgres;alter default privileges for role postgres in schema public grant all on tables to anon,authenticated,service_role;",
  );
  const migrations = readdirSync(join(root, "supabase/migrations"))
    .filter((n) => /^\d{14}_.+\.sql$/.test(n))
    .sort();
  phase = "replay application migrations";
  for (const file of migrations)
    sql(
      source,
      "set role postgres;\n" + readFileSync(join(root, "supabase/migrations", file), "utf8"),
    );
  sql(
    source,
    "create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);",
  );
  for (const file of migrations)
    sql(
      source,
      `insert into supabase_migrations.schema_migrations(version,name)values(${quote(file.slice(0, 14))},${quote(file.slice(15, -4))});`,
    );
  phase = "synthetic account and TOTP";
  const a = api(sourceAuth),
    b = api(sourceAuth);
  const password = `Recovery9!${randomUUID()}`;
  secretValues.push(password);
  const emailA = `recovery-a-${runId}@example.com`,
    emailB = `recovery-b-${runId}@example.com`;
  const userA = (await checked(a.auth.signUp({ email: emailA, password }))).user;
  const userB = (await checked(b.auth.signUp({ email: emailB, password }))).user;
  assert.ok(userA?.id && userB?.id);
  const factor = await checked(
    a.auth.mfa.enroll({ factorType: "totp", friendlyName: "Synthetic recovery factor" }),
  );
  secretValues.push(factor.totp.secret);
  await checked(
    a.auth.mfa.challengeAndVerify({ factorId: factor.id, code: totp(factor.totp.secret) }),
  );
  const verifiedStep = Math.floor(Date.now() / 30000);
  const deck = randomUUID(),
    concept = randomUUID(),
    item = randomUUID(),
    tag = randomUUID(),
    session = randomUUID();
  const fixtureOwner = (owner) =>
    `set local role authenticated;set local request.jwt.claims=${quote(JSON.stringify({ sub: owner, role: "authenticated" }))};set local request.jwt.claim.sub=${quote(owner)};`;
  phase = "synthetic library and progress";
  for (const user of [userA, userB])
    sql(
      source,
      `begin;${fixtureOwner(user.id)}insert into public.profiles(id)values(${quote(user.id)});select public.complete_onboarding('en','A1','A1',5);commit;`,
    );
  const course = sql(source, `select id from public.courses where owner_id=${quote(userA.id)};`);
  sql(
    source,
    `begin;${fixtureOwner(userA.id)}
    insert into public.decks(id,owner_id,course_id,title)values(${quote(deck)},${quote(userA.id)},${quote(course)},'Synthetic recovery deck');
    insert into public.concepts(id,owner_id,course_id,kind,title,summary)values(${quote(concept)},${quote(userA.id)},${quote(course)},'vocabulary','Synthetic recovery concept','Unicode: '||chr(241)||chr(28450));
    insert into public.practice_items(id,owner_id,concept_id,mode,prompt_text,answer_text,config)values(${quote(item)},${quote(userA.id)},${quote(concept)},'basic_recognition','Synthetic prompt','Synthetic meaning','{"mode":"basic_recognition"}');
    insert into public.tags(id,owner_id,course_id,display_name,normalized_name)values(${quote(tag)},${quote(userA.id)},${quote(course)},'Synthetic::Recovery','synthetic::recovery');
    insert into public.concept_tags(owner_id,concept_id,tag_id)values(${quote(userA.id)},${quote(concept)},${quote(tag)});
    insert into public.deck_concepts(owner_id,deck_id,concept_id)values(${quote(userA.id)},${quote(deck)},${quote(concept)});
    commit;
    insert into public.study_sessions(id,owner_id,course_id)values(${quote(session)},${quote(userA.id)},${quote(course)});
    insert into public.review_logs(owner_id,practice_item_id,study_session_id,idempotency_key,rating,reviewed_at,state_before,state_after,due_before,due_after,scheduler_version,config_version)
    values(${quote(userA.id)},${quote(item)},${quote(session)},'synthetic-recovery-review','good',now(),'{"phase":"new"}','{"phase":"learning"}',now(),now()+interval '10 minutes','5.4.2','v1');
    insert into public.learning_states(owner_id,practice_item_id,phase,due_at,scheduler_version,config_version,reps,difficulty,stability,last_reviewed_at)
    values(${quote(userA.id)},${quote(item)},'learning',now()+interval '10 minutes','5.4.2','v1',1,5,0.4,now()) on conflict do nothing;
    update public.learning_states set phase='learning',reps=1,due_at=now()+interval '10 minutes' where practice_item_id=${quote(item)};
  `,
  );
  docker(["stop", helpers[0]]);
  const expected = fingerprint(source),
    dump = join(artifacts, "source.dump");
  phase = "consistent dump";
  const started = performance.now();
  // Binary bytes stay out of JS strings and logs.
  const dumped = spawnSync(
    "docker",
    [
      "exec",
      container,
      "pg_dump",
      "-U",
      "supabase_admin",
      "-d",
      source,
      "--format=custom",
      "--no-comments",
    ],
    { encoding: null, maxBuffer: 64 * 1024 * 1024, timeout: 60000 },
  );
  if (dumped.status !== 0) throw Error("Synthetic pg_dump failed");
  writeFileSync(dump, dumped.stdout, { mode: 0o600 });
  const archive = join(artifacts, "synthetic.lexorabak"),
    restored = join(artifacts, "verified.dump");
  const schemaVersion = Number(migrations.at(-1).slice(0, 14));
  assert.equal(
    (
      await sealBackup({
        input: dump,
        output: archive,
        passphrase,
        schemaVersion,
        appVersion: JSON.parse(readFileSync("package.json", "utf8")).version,
      })
    ).ok,
    true,
  );
  phase = "verify before staging";
  assert.equal(
    (
      await openBackup({
        input: archive,
        output: restored,
        passphrase,
        maxSchemaVersion: schemaVersion,
      })
    ).ok,
    true,
  );
  phase = "fresh transactional restore";
  createDatabase(target);
  const restoreStart = performance.now();
  const restore = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "pg_restore",
      "-U",
      "supabase_admin",
      "-d",
      target,
      "--single-transaction",
      "--exit-on-error",
    ],
    { input: readFileSync(restored), encoding: "utf8", maxBuffer: 8 * 1024 * 1024, timeout: 60000 },
  );
  if (restore.status !== 0) {
    writeFileSync(join(artifacts, "restore-diagnostic.log"), restore.stderr, { mode: 0o600 });
    throw Error("Synthetic restore failed");
  }
  const actual = fingerprint(target);
  assert.deepEqual(actual, expected);
  const restoreMs = performance.now() - restoreStart;
  phase = "restored Auth and RLS";
  authUrl.pathname = `/${target}`;
  restUrl.pathname = `/${target}`;
  const restoredAuth = await helper(
    "restored-auth",
    authConfig.Config.Image,
    authEnv(authUrl.href),
    9999,
  );
  const restoredRest = await helper(
    "restored-rest",
    restConfig.Config.Image,
    {
      PGRST_DB_URI: restUrl.href,
      PGRST_JWT_SECRET: jwtSecret,
      PGRST_DB_ANON_ROLE: "anon",
      PGRST_DB_SCHEMAS: "public",
      PGRST_DB_EXTRA_SEARCH_PATH: "public",
      PGRST_SERVER_PORT: "3000",
    },
    3000,
  );
  const recoveredA = api(restoredAuth, restoredRest),
    recoveredB = api(restoredAuth, restoredRest),
    anon = api(restoredAuth, restoredRest);
  const signedA = await checked(recoveredA.auth.signInWithPassword({ email: emailA, password }));
  assert.equal(signedA.user.id, userA.id);
  assert.equal((await checked(recoveredA.auth.mfa.listFactors())).totp[0]?.id, factor.id);
  if (Math.floor(Date.now() / 30000) <= verifiedStep)
    await new Promise((r) => setTimeout(r, (verifiedStep + 1) * 30000 - Date.now() + 250));
  await checked(
    recoveredA.auth.mfa.challengeAndVerify({ factorId: factor.id, code: totp(factor.totp.secret) }),
  );
  assert.equal(
    (await checked(recoveredA.auth.mfa.getAuthenticatorAssuranceLevel())).currentLevel,
    "aal2",
  );
  await checked(recoveredB.auth.signInWithPassword({ email: emailB, password }));
  assert.equal(
    (await checked(recoveredA.from("concepts").select("id").eq("id", concept)))[0]?.id,
    concept,
  );
  assert.deepEqual(await checked(recoveredB.from("concepts").select("id").eq("id", concept)), []);
  assert.deepEqual(await checked(anon.from("concepts").select("id").eq("id", concept)), []);
  assert.equal(
    (await checked(recoveredA.from("review_logs").select("id").eq("practice_item_id", item)))
      .length,
    1,
  );
  assert.equal(
    (
      await checked(
        recoveredA.rpc("count_library_deck_concepts", { p_owner_id: userA.id, p_deck_ids: [deck] }),
      )
    )[deck],
    1,
  );
  assert.ok(
    (await anon.rpc("count_library_deck_concepts", { p_owner_id: userA.id, p_deck_ids: [deck] }))
      .error,
  );
  const result = {
    schemaVersion,
    migrations: migrations.length,
    tables: expected.tables,
    fingerprintMatched: true,
    freshPasswordLogin: true,
    restoredTotpAal2: true,
    ownerForeignAnonymousRls: true,
    reviewHistoryPreserved: true,
    privilegesPreserved: true,
    restoreAndCompareMs: restoreMs,
    totalRehearsalMs: performance.now() - started,
    authImage: authConfig.Config.Image,
    restImage: restConfig.Config.Image,
    syntheticOnly: true,
  };
  writeFileSync(join(artifacts, "summary.json"), JSON.stringify(result, null, 2));
  for (const file of [dump, restored]) unlinkSync(file);
  console.log(JSON.stringify(result));
  console.log(`Private rehearsal artifacts: ${artifacts}`);
} catch (error) {
  console.error(`Recovery rehearsal failed at ${phase}: ${error.message}`);
  process.exitCode = 1;
} finally {
  for (const name of helpers.reverse()) {
    const inspected = spawnSync("docker", ["inspect", name], { encoding: "utf8" });
    if (inspected.status === 0) {
      const config = JSON.parse(inspected.stdout)[0];
      if (config.Config.Labels?.["lexora.recovery.run"] !== runId)
        throw Error("Refusing to remove an unrelated helper");
      docker(["rm", "-f", name]);
    }
  }
  for (const database of databases.reverse()) {
    if (!/^lexora_recovery_(source|target)_[a-f0-9]{32}$/.test(database))
      throw Error("Refusing unrelated database cleanup");
    sql("postgres", `drop database ${database} with (force);`);
  }
  console.log(
    `Cleaned ${databases.length} disposable databases and ${helpers.length} labelled helpers; ordinary databases untouched.`,
  );
}
