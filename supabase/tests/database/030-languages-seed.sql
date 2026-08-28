-- LEX-2.2 — El seed del catálogo de idiomas.
--
-- **No es autocontenido.** A diferencia del resto de la suite, esta prueba lee
-- datos que siembra `supabase/seed.sql`, así que exige una base sembrada. En
-- local y en CI eso lo garantiza `db:reset` (el job de base de datos lo ejecuta).
-- Contra una base sembrada de otra forma, fallará: es lo esperado.
--
-- Comprueba las tres filas **por su UUID fijo**, no el total de la tabla: si un
-- día otra tarea añade un idioma, esta prueba debe seguir hablando del seed y no
-- fallar por una causa que no menciona.
--
-- «Idempotente» aquí significa una cosa y otra no:
--   · SÍ: re-ejecutar los `insert` del seed no añade filas (`on conflict do
--     nothing`). Se prueba abajo, dentro de la transacción.
--   · NO: que `db:reset` sea idempotente. `db:reset` borra la base antes de
--     sembrar; no hay conflicto que resolver. No es lo que cubre esta prueba.

begin;
select plan(5);

select is(
  (select count(*)::int from public.languages
    where id = any (array[
      '5eeda001-0000-4000-8000-000000000001',
      '5eeda001-0000-4000-8000-000000000002',
      '5eeda001-0000-4000-8000-000000000003'
    ]::uuid[])),
  3,
  'las tres filas del seed están presentes (por su UUID fijo)'
);

select bag_eq(
  $$ select code, locale from public.languages
      where id = any (array[
        '5eeda001-0000-4000-8000-000000000001',
        '5eeda001-0000-4000-8000-000000000002',
        '5eeda001-0000-4000-8000-000000000003'
      ]::uuid[]) $$,
  $$ values ('es', 'es'), ('en', 'en'), ('en', 'en-GB') $$,
  'los pares (code, locale) del seed son es/es, en/en y en/en-GB'
);

select is(
  (select id::text from public.languages where code = 'en' and locale = 'en-GB'),
  '5eeda001-0000-4000-8000-000000000003',
  'la fila en/en-GB conserva su UUID fijo del seed'
);

-- Re-ejecuta los mismos inserts del seed: no deben añadir nada.
insert into public.languages (id, code, locale, name_key, active) values
  ('5eeda001-0000-4000-8000-000000000001', 'es', 'es',    'language.es',    true),
  ('5eeda001-0000-4000-8000-000000000002', 'en', 'en',    'language.en',    true),
  ('5eeda001-0000-4000-8000-000000000003', 'en', 'en-GB', 'language.en_gb', true)
on conflict (code, locale) do nothing;

select is(
  (select count(*)::int from public.languages
    where id = any (array[
      '5eeda001-0000-4000-8000-000000000001',
      '5eeda001-0000-4000-8000-000000000002',
      '5eeda001-0000-4000-8000-000000000003'
    ]::uuid[])),
  3,
  're-ejecutar los inserts del seed no añade filas (on conflict do nothing)'
);

select ok(
  (select bool_and(active) from public.languages
    where id = any (array[
      '5eeda001-0000-4000-8000-000000000001',
      '5eeda001-0000-4000-8000-000000000002',
      '5eeda001-0000-4000-8000-000000000003'
    ]::uuid[])),
  'las tres filas del seed quedan activas'
);

select * from finish();
rollback;
