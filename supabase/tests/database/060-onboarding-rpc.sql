-- LEX-2.7 — `public.complete_onboarding(...)`, the idempotent onboarding write.
--
-- **Not self-contained** (like 030): the function resolves the reference
-- language pair from `supabase/seed.sql` (es/es, en/en), so this file needs a
-- seeded database. `db:reset` guarantees it in local and CI; against a base
-- seeded another way it fails, which is expected.
--
-- Exercised as `authenticated` with `auth.uid()` pinned before anything, for
-- the reason 040/050 spell out: run as the migration role (BYPASSRLS) every
-- write would pass regardless of the LEX-2.3 policies and the green would be
-- vacuous. The function is SECURITY INVOKER precisely so those policies apply.
--
-- The discriminating assertion is the second call: it passes *different*
-- values and checks they won. That is what proves the repeat is an idempotent
-- update of the one course, not a silent no-op and not a second course.

begin;
select plan(34);

-- Fixture (migration role: BYPASSRLS).
insert into auth.users (id) values
  ('a5e00003-0000-4000-8000-000000000003'),   -- user C
  ('a5e00004-0000-4000-8000-000000000004');   -- user D (never onboards; isolation)

-- --- The function is SECURITY INVOKER and has search_path pinned ------------

select is(
  (select prosecdef from pg_proc where proname = 'complete_onboarding'),
  false,
  'complete_onboarding es SECURITY INVOKER (corre como quien llama, no como su dueño)'
);

select ok(
  (select array_to_string(proconfig, ',') like '%search_path=%'
     from pg_proc where proname = 'complete_onboarding'),
  'complete_onboarding fija search_path (no lo captura el search_path de quien llama)'
);

-- ===========================================================================
-- Como user C: primer onboarding.
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"a5e00003-0000-4000-8000-000000000003","role":"authenticated"}';

select is(
  (select auth.uid())::text,
  'a5e00003-0000-4000-8000-000000000003',
  'auth.uid() resuelve a C dentro del rol authenticated'
);

-- C se crea su propio perfil (política profiles_insert_own), como haría la
-- capa de aplicación antes de llamar al onboarding.
insert into public.profiles (id) values ('a5e00003-0000-4000-8000-000000000003');

select lives_ok(
  $$ select public.complete_onboarding('es', 'B1', 'A1', 5) $$,
  'C ejecuta complete_onboarding sin error'
);

select is(
  (select count(*)::int from public.courses
    where owner_id = 'a5e00003-0000-4000-8000-000000000003'),
  1,
  'el onboarding crea exactamente un curso para C'
);

select is(
  (select source_language_id from public.courses
    where owner_id = 'a5e00003-0000-4000-8000-000000000003'),
  (select id from public.languages where code = 'es' and locale = 'es'),
  'source_language_id = fila es/es del catálogo'
);

select is(
  (select target_language_id from public.courses
    where owner_id = 'a5e00003-0000-4000-8000-000000000003'),
  (select id from public.languages where code = 'en' and locale = 'en'),
  'target_language_id = fila en/en del catálogo'
);

select is(
  (select target_locale from public.courses
    where owner_id = 'a5e00003-0000-4000-8000-000000000003'),
  'en-GB',
  'target_locale = en-GB (curso de referencia)'
);

select is(
  (select declared_level::text from public.courses
    where owner_id = 'a5e00003-0000-4000-8000-000000000003'),
  'B1',
  'declared_level = el nivel académico declarado'
);

select is(
  (select start_level::text from public.courses
    where owner_id = 'a5e00003-0000-4000-8000-000000000003'),
  'A1',
  'start_level = el nivel desde el que se empieza'
);

select is(
  (select cs.daily_new_limit
     from public.course_settings cs
     join public.courses c on c.id = cs.course_id
    where c.owner_id = 'a5e00003-0000-4000-8000-000000000003'),
  5,
  'course_settings.daily_new_limit = límite de ítems nuevos elegido'
);

select is(
  (select ui_locale::text from public.profiles
    where id = 'a5e00003-0000-4000-8000-000000000003'),
  'es',
  'profiles.ui_locale = idioma de interfaz elegido'
);

select isnt(
  (select onboarding_completed_at from public.profiles
    where id = 'a5e00003-0000-4000-8000-000000000003'),
  null,
  'profiles.onboarding_completed_at queda fijado'
);

select is(
  (select title from public.courses
    where owner_id = 'a5e00003-0000-4000-8000-000000000003'),
  'Inglés',
  'title en el idioma de interfaz de C (es)'
);

-- LEX-2.9: el onboarding deja al usuario con un curso activo.
select is(
  (select active_course_id from public.profiles
    where id = 'a5e00003-0000-4000-8000-000000000003'),
  (select id from public.courses
    where owner_id = 'a5e00003-0000-4000-8000-000000000003'),
  'profiles.active_course_id apunta al curso recién creado'
);

-- Instantánea para comparar tras la repetición. Se crea como el rol de
-- migración (no depende de que `authenticated` tenga privilegio TEMP); solo
-- lee la fila de C, cuyo valor es el mismo con RLS o sin ella.
--
-- Además se pone `active_course_id` a NULL: la segunda llamada debe volver a
-- fijarlo. Así el `coalesce(active_course_id, curso)` de la función se prueba
-- por su rama de escritura, y no da un falso verde por «ya estaba bien».
reset role;
create temp table _snap as
  select
    (select id from public.courses
      where owner_id = 'a5e00003-0000-4000-8000-000000000003') as course_id,
    (select onboarding_completed_at from public.profiles
      where id = 'a5e00003-0000-4000-8000-000000000003') as completed_at;
grant select on _snap to authenticated;

update public.profiles
  set active_course_id = null
  where id = 'a5e00003-0000-4000-8000-000000000003';

-- ===========================================================================
-- Como user C: repite el onboarding con OTROS valores.
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"a5e00003-0000-4000-8000-000000000003","role":"authenticated"}';

select lives_ok(
  $$ select public.complete_onboarding('en', 'A2', 'A2', 10) $$,
  'C repite complete_onboarding sin error'
);

select is(
  (select count(*)::int from public.courses
    where owner_id = 'a5e00003-0000-4000-8000-000000000003'),
  1,
  'repetir el onboarding NO crea un segundo curso (idempotente)'
);

select is(
  (select id from public.courses
    where owner_id = 'a5e00003-0000-4000-8000-000000000003'),
  (select course_id from _snap),
  'es el mismo curso, no uno nuevo'
);

select is(
  (select declared_level::text from public.courses
    where owner_id = 'a5e00003-0000-4000-8000-000000000003'),
  'A2',
  'la segunda llamada actualiza declared_level (no es un no-op)'
);

select is(
  (select cs.daily_new_limit
     from public.course_settings cs
     join public.courses c on c.id = cs.course_id
    where c.owner_id = 'a5e00003-0000-4000-8000-000000000003'),
  10,
  'la segunda llamada actualiza daily_new_limit'
);

select is(
  (select ui_locale::text from public.profiles
    where id = 'a5e00003-0000-4000-8000-000000000003'),
  'en',
  'la segunda llamada actualiza ui_locale'
);

select is(
  (select onboarding_completed_at from public.profiles
    where id = 'a5e00003-0000-4000-8000-000000000003'),
  (select completed_at from _snap),
  'onboarding_completed_at NO se pisa en la repetición (la primera vez es la que cuenta)'
);

select is(
  (select title from public.courses
    where owner_id = 'a5e00003-0000-4000-8000-000000000003'),
  'Inglés',
  'repetir el onboarding NO cambia el título (rama de actualización)'
);

-- Se puso a NULL antes de esta llamada: la función lo vuelve a fijar.
select is(
  (select active_course_id from public.profiles
    where id = 'a5e00003-0000-4000-8000-000000000003'),
  (select course_id from _snap),
  'la segunda llamada re-fija active_course_id si estaba en NULL (coalesce)'
);

-- El CHECK course_settings_daily_new_limit_range (0..100) sigue mandando: la
-- función no lo puentea.
select throws_ok(
  $$ select public.complete_onboarding('es', 'B1', 'A1', 101) $$,
  '23514',
  null,
  'un límite fuera de rango lo rechaza el CHECK de course_settings'
);

-- ===========================================================================
-- Como user D: no dueño. Onboarding aísla por `owner_id`.
--
-- CLAUDE.md §2 exige caso dueño y caso no-dueño. D ejecuta su propio
-- onboarding y obtiene SU curso; el de C no se toca. Sin `where owner_id`
-- correcto en la búsqueda de curso existente, la función de D encontraría el
-- de C y lo pisaría — esta es la asserción que lo descarta.
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"a5e00004-0000-4000-8000-000000000004","role":"authenticated"}';

select is(
  (select count(*)::int from public.courses
    where owner_id = 'a5e00004-0000-4000-8000-000000000004'),
  0,
  'D no tiene curso antes de su onboarding'
);

insert into public.profiles (id) values ('a5e00004-0000-4000-8000-000000000004');

select lives_ok(
  $$ select public.complete_onboarding('en', 'A1', 'A1', 7) $$,
  'D ejecuta su propio complete_onboarding sin error'
);

select is(
  (select count(*)::int from public.courses
    where owner_id = 'a5e00004-0000-4000-8000-000000000004'),
  1,
  'D obtiene exactamente un curso'
);

select isnt(
  (select id from public.courses
    where owner_id = 'a5e00004-0000-4000-8000-000000000004'),
  (select course_id from _snap),
  'el curso de D es distinto del de C (no se ha reutilizado)'
);

select is(
  (select title from public.courses
    where owner_id = 'a5e00004-0000-4000-8000-000000000004'),
  'English',
  'title en el idioma de interfaz de D (en)'
);

-- C sigue intacto. Se comprueba como el rol de migración: bajo RLS, D no ve
-- las filas de C (`courses_select_own`), así que este control tiene que
-- mirar desde fuera de la sesión de D.
reset role;

select is(
  (select count(*)::int from public.courses
    where owner_id = 'a5e00003-0000-4000-8000-000000000003'),
  1,
  'el onboarding de D no añade un curso a C'
);

select is(
  (select declared_level::text from public.courses
    where owner_id = 'a5e00003-0000-4000-8000-000000000003'),
  'A2',
  'el onboarding de D no pisa el nivel declarado de C'
);

select is(
  (select cs.daily_new_limit
     from public.course_settings cs
     join public.courses c on c.id = cs.course_id
    where c.owner_id = 'a5e00003-0000-4000-8000-000000000003'),
  10,
  'el onboarding de D no pisa el límite diario de C'
);

-- ===========================================================================
-- Como anon: no puede ejecutar la función.
-- ===========================================================================

reset role;
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select throws_ok(
  $$ select public.complete_onboarding('es', 'B1', 'A1', 5) $$,
  '42501',
  null,
  'anon no tiene privilegio EXECUTE sobre complete_onboarding'
);

reset role;

select * from finish();
rollback;
