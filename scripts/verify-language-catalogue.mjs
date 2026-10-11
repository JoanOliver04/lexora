/**
 * Run the real migration files in a disposable LOCAL PostgreSQL database.
 * Never reads seed.sql, environment credentials or the linked cloud project.
 * The minimal managed Auth surface below is test scaffolding, not an Auth
 * deployment or an end-to-end test of the hosted platform.
 */
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const container = "supabase_db_lexora";
const database = `lexora_catalogue_test_${randomUUID().replaceAll("-", "")}`;
const migrationDirectory = join(root, "supabase/migrations");
const migrations = readdirSync(migrationDirectory)
  .filter((file) => file.endsWith(".sql"))
  .sort();
const catalogue = readFileSync(
  join(migrationDirectory, "20261011120000_language_catalogue.sql"),
  "utf8",
);

function sql(target, source) {
  const result = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-X",
      "-U",
      "postgres",
      "-d",
      target,
      "-v",
      "ON_ERROR_STOP=1",
      "-f",
      "-",
    ],
    { input: source, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || "Local PostgreSQL failed");
  return result;
}

let created = false;
try {
  // The exact local container and random, validated database name are the only
  // targets. Never connect through Supabase CLI's linked-project credentials.
  if (!/^lexora_catalogue_test_[a-f0-9]{32}$/.test(database)) {
    throw new Error("Invalid disposable database name");
  }
  sql("postgres", `create database ${database} template template0;`);
  created = true;
  sql(
    database,
    `
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth, public to anon, authenticated, service_role;
    alter default privileges in schema public
      grant all on tables to anon, authenticated, service_role;
  `,
  );
  for (const migration of migrations) {
    sql(database, readFileSync(join(migrationDirectory, migration), "utf8"));
  }

  const result = sql(
    database,
    `
    begin;
    create function pg_temp.assert_true(condition boolean, label text)
    returns void language plpgsql as $$
    begin
      if condition is distinct from true then raise exception 'FAIL: %', label; end if;
      raise notice 'PASS: %', label;
    end $$;

    select pg_temp.assert_true((select count(*) = 3 from public.languages),
      'fresh migrations create exactly three languages without seed');
    select pg_temp.assert_true((select count(*) = 3 from public.languages where
      (code, locale, name_key, active) in (
        ('es', 'es', 'language.es', true),
        ('en', 'en', 'language.en', true),
        ('en', 'en-GB', 'language.en_gb', true))), 'reference pairs and translations');
    select pg_temp.assert_true(
      (select count(*) = 0 from auth.users) and
      (select count(*) = 0 from public.profiles) and
      (select count(*) = 0 from public.courses) and
      (select count(*) = 0 from public.practice_items), 'no users or study content inserted');
    create temp table catalogue_snapshot as select to_jsonb(l) as row from public.languages l;
    ${catalogue}
    select pg_temp.assert_true(not exists (
      (select to_jsonb(l) from public.languages l except select row from catalogue_snapshot)
      union all
      (select row from catalogue_snapshot except select to_jsonb(l) from public.languages l)
    ), 'replay preserves every column including timestamps');

    savepoint fixtures;
    delete from public.languages where code = 'en';
    insert into public.languages(id, code, locale, name_key, active, created_at, updated_at)
    values ('00000000-0000-4000-8000-000000000042', 'en', 'en', 'custom.en', false,
      '2020-01-01', '2020-01-02');
    insert into public.languages(code, locale, name_key) values ('zz', 'zz', 'custom.zz');
    ${catalogue}
    select pg_temp.assert_true((select id = '00000000-0000-4000-8000-000000000042'::uuid
      and name_key = 'custom.en' and not active and created_at = '2020-01-01'::timestamptz
      and updated_at = '2020-01-02'::timestamptz
      from public.languages where code = 'en' and locale = 'en'),
      'existing natural key preserves custom ID and all metadata');
    select pg_temp.assert_true((select id = '5eeda001-0000-4000-8000-000000000003'::uuid
      from public.languages where code = 'en' and locale = 'en-GB'), 'missing variant inserted');
    select pg_temp.assert_true((select name_key = 'custom.zz' from public.languages
      where code = 'zz' and locale = 'zz'), 'unrelated language retained');
    truncate catalogue_snapshot;
    insert into catalogue_snapshot select to_jsonb(l) from public.languages l;
    ${catalogue}
    select pg_temp.assert_true(not exists (
      (select to_jsonb(l) from public.languages l except select row from catalogue_snapshot)
      union all
      (select row from catalogue_snapshot except select to_jsonb(l) from public.languages l)
    ), 'partial catalogue replay is idempotent');
    rollback to savepoint fixtures;

    savepoint collision;
    delete from public.languages;
    insert into public.languages(id, code, locale, name_key)
    values ('5eeda001-0000-4000-8000-000000000002', 'zz', 'zz', 'custom.zz');
    do $$
    begin
      begin
        execute $migration$${catalogue}$migration$;
        raise exception 'Expected primary-key collision';
      exception when unique_violation then null;
      end;
    end $$;
    select pg_temp.assert_true((select count(*) = 1 and bool_and(code = 'zz')
      from public.languages), 'primary-key collision fails atomically without overwrites');
    rollback to savepoint collision;

    select pg_temp.assert_true((select relrowsecurity from pg_class
      where oid = 'public.languages'::regclass), 'RLS remains enabled');
    set local role anon;
    select pg_temp.assert_true((select count(*) = 3 from public.languages), 'anon can read catalogue');
    do $$ begin
      begin
        insert into public.languages(code, locale, name_key) values ('zz', 'zz', 'denied');
        raise exception 'Expected RLS denial';
      exception when insufficient_privilege then null; end;
    end $$;
    select pg_temp.assert_true((select count(*) = 3 from public.languages), 'anon cannot insert');
    reset role;
    insert into auth.users(id) values ('00000000-0000-4000-8000-000000000043');
    insert into public.profiles(id) values ('00000000-0000-4000-8000-000000000043');
    set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000043';
    set local role authenticated;
    select pg_temp.assert_true((select count(*) = 3 from public.languages),
      'authenticated can read catalogue');
    do $$ begin
      begin
        insert into public.languages(code, locale, name_key) values ('zz', 'zz', 'denied');
        raise exception 'Expected RLS denial';
      exception when insufficient_privilege then null; end;
    end $$;
    select pg_temp.assert_true((select count(*) = 3 from public.languages),
      'authenticated cannot insert');
    select public.complete_onboarding('es', 'A1', 'A1', 5);
    select pg_temp.assert_true((select count(*) = 1 from public.courses),
      'onboarding resolves reference languages without seed');
    rollback;
  `,
  );
  const passes = result.stderr.split(/\r?\n/).filter((line) => line.includes("PASS:"));
  if (passes.length !== 15) throw new Error(`Expected 15 assertions, received ${passes.length}`);
  for (const pass of passes) console.log(pass.slice(pass.indexOf("PASS:")));
  console.log(`${migrations.length} real migrations; 15 assertions passed; no seed executed.`);
} finally {
  if (created) {
    sql("postgres", `drop database ${database};`);
    console.log(
      "Disposable local database removed; ordinary local and remote databases untouched.",
    );
  }
}
