-- LEX-2.4 — Creación idempotente del perfil.
--
-- LEX-2.4 no añade esquema: la fila de perfil se crea desde la capa de
-- aplicación (ADR-005), y las garantías de base de datos que la sostienen ya
-- existen —la clave primaria de `profiles` (LEX-2.1) y la política
-- `profiles_insert_own` (LEX-2.3)—. Este fichero las fija: si alguien quita
-- cualquiera de las dos, la suite lo dice.
--
-- Autocontenido, como 040: crea sus propios usuarios en `auth.users` y luego se
-- convierte en `authenticated`. Cada bloque fija `auth.uid()` antes de nada,
-- por la misma razón que 040 (un JWT que no llegara a `auth.uid()` daría un
-- falso verde).

begin;
select plan(9);

-- Fixture (rol de migración: BYPASSRLS).
insert into auth.users (id) values
  ('a5e00001-0000-4000-8000-000000000001'),   -- user A
  ('a5e00002-0000-4000-8000-000000000002');   -- user B

-- ===========================================================================
-- Como user A.
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"a5e00001-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  (select auth.uid())::text,
  'a5e00001-0000-4000-8000-000000000001',
  'auth.uid() resuelve a A dentro del rol authenticated'
);

-- Primer "ensure": inserta una fila. `returning` no está vacío.
with i as (
  insert into public.profiles (id)
  values ('a5e00001-0000-4000-8000-000000000001')
  on conflict (id) do nothing
  returning 1
)
select is(
  (select count(*)::int from i),
  1,
  'el primer ensure inserta exactamente una fila de perfil'
);

select is(
  (select count(*)::int from public.profiles
    where id = 'a5e00001-0000-4000-8000-000000000001'),
  1,
  'A tiene exactamente una fila de perfil'
);

select is(
  (select ui_locale::text from public.profiles
    where id = 'a5e00001-0000-4000-8000-000000000001'),
  'es',
  'el perfil asegurado con solo el id queda usable: ui_locale por defecto es es'
);

-- Segundo "ensure": no-op. `returning` vacío. Idempotente / reintento seguro.
with i as (
  insert into public.profiles (id)
  values ('a5e00001-0000-4000-8000-000000000001')
  on conflict (id) do nothing
  returning 1
)
select is(
  (select count(*)::int from i),
  0,
  'el segundo ensure no inserta nada (idempotente)'
);

select is(
  (select count(*)::int from public.profiles
    where id = 'a5e00001-0000-4000-8000-000000000001'),
  1,
  'sigue habiendo exactamente una fila de perfil para A'
);

-- El insert "a pelo" de un id duplicado viola la PK. Esta es la asserción que
-- discrimina: es la clave primaria la que hace el perfil no duplicable, no la
-- cláusula ON CONFLICT. Sin PK, esto no lanzaría y la fila se duplicaría.
select throws_ok(
  $$ insert into public.profiles (id)
     values ('a5e00001-0000-4000-8000-000000000001') $$,
  '23505',
  null,
  'un insert duplicado a pelo viola la clave primaria de profiles'
);

-- A no puede asegurar el perfil de B, ni siquiera con ON CONFLICT: la política
-- profiles_insert_own (WITH CHECK auth.uid() = id) rechaza la fila candidata.
select throws_ok(
  $$ insert into public.profiles (id)
     values ('a5e00002-0000-4000-8000-000000000002')
     on conflict (id) do nothing $$,
  '42501',
  null,
  'A no puede crear el perfil de B (RLS profiles_insert_own)'
);

-- ===========================================================================
-- Como anon.
-- ===========================================================================

reset role;
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select throws_ok(
  $$ insert into public.profiles (id)
     values ('a5e00001-0000-4000-8000-000000000001')
     on conflict (id) do nothing $$,
  '42501',
  null,
  'anon no puede crear perfiles'
);

reset role;

select * from finish();
rollback;
