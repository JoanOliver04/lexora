-- LEX-2.1 — Estructura de las tablas de identidad y curso.
--
-- Comprueba que la migración `identity_and_course` deja el esquema que phase 2
-- espera: las cuatro tablas, sus claves, los CHECK que acotan valores y el
-- guardián de zona horaria. El aislamiento entre usuarios (dueño / no dueño)
-- es LEX-2.3 y no se prueba aquí.
--
-- El estilo sigue a 000-setup.sql y 010-rls-enabled.sql: un fichero por
-- área, `begin`/`rollback`, y cada CHECK se prueba rechazando un valor
-- inválido además de aceptar uno válido — un guardián que nunca ha dicho que
-- no no está probado.

begin;
select plan(31);

-- --- Las cuatro tablas existen, con clave primaria ---------------------------

select has_table('public', 'profiles',        'profiles existe');
select has_table('public', 'languages',       'languages existe');
select has_table('public', 'courses',         'courses existe');
select has_table('public', 'course_settings', 'course_settings existe');

select has_pk('public', 'profiles',        'profiles tiene PK');
select has_pk('public', 'languages',       'languages tiene PK');
select has_pk('public', 'courses',         'courses tiene PK');
select has_pk('public', 'course_settings', 'course_settings tiene PK');

select col_is_pk('public', 'profiles',        'id',        'profiles.id es la PK');
select col_is_pk('public', 'course_settings', 'course_id', 'course_settings.course_id es la PK');

-- --- Claves foráneas que sostienen el aislamiento --------------------------

select fk_ok(
  'public', 'profiles', 'id',
  'auth',   'users',    'id',
  'profiles.id referencia auth.users.id'
);

select fk_ok(
  'public', 'courses',  'owner_id',
  'public', 'profiles', 'id',
  'courses.owner_id referencia profiles.id'
);

select fk_ok(
  'public', 'course_settings', ARRAY['course_id', 'user_id'],
  'public', 'courses',         ARRAY['id', 'owner_id'],
  'course_settings referencia (id, owner_id) de courses: settings solo para el dueño'
);

-- --- RLS habilitado en las cuatro (políticas: LEX-2.3) ---------------------

select is(
  (select bool_and(c.relrowsecurity)
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('profiles', 'languages', 'courses', 'course_settings')),
  true,
  'RLS habilitado en profiles, languages, courses y course_settings'
);

-- --- Enums de estados cerrados -------------------------------------------------

select has_type('public', 'ui_locale',  'existe el enum ui_locale');
select has_type('public', 'cefr_level', 'existe el enum cefr_level');

-- --- profiles: zona horaria IANA -------------------------------------------

insert into auth.users (id) values ('00000000-0000-0000-0000-000000000001');

select lives_ok(
  $$ insert into public.profiles (id, timezone)
     values ('00000000-0000-0000-0000-000000000001', 'Europe/Madrid') $$,
  'profiles acepta una zona horaria IANA válida'
);

-- Comprueba el SQLSTATE (23514, fijado con `using errcode` en el trigger), no
-- el texto exacto: así un cambio cosmético del mensaje no rompe la prueba, pero
-- quitar el `errcode` del trigger sí.
select throws_ok(
  $$ update public.profiles set timezone = 'Mars/Olympus'
     where id = '00000000-0000-0000-0000-000000000001' $$,
  '23514',
  null,
  'profiles rechaza una zona horaria que no es IANA'
);

select is(
  (select ui_locale::text from public.profiles
    where id = '00000000-0000-0000-0000-000000000001'),
  'es',
  'profiles.ui_locale por defecto es es'
);

-- --- languages: base o variante, nunca una mezcla -------------------------

select lives_ok(
  $$ insert into public.languages (code, locale, name_key)
     values ('en', 'en-GB', 'language.en_gb') $$,
  'languages acepta una variante regional bien formada (en / en-GB)'
);

select lives_ok(
  $$ insert into public.languages (code, locale, name_key)
     values ('es', 'es', 'language.es') $$,
  'languages acepta un idioma base (locale = code)'
);

select throws_like(
  $$ insert into public.languages (code, locale, name_key)
     values ('en', 'fr-FR', 'language.broken') $$,
  '%languages_locale_base_or_variant%',
  'languages rechaza una variante cuyo prefijo no es su code'
);

select throws_like(
  $$ insert into public.languages (code, locale, name_key)
     values ('en', 'en-GB', 'language.dup') $$,
  '%languages_code_locale_unique%',
  'languages rechaza (code, locale) duplicado'
);

-- --- courses: origen y destino distintos ---------------------------------

select throws_like(
  $$ insert into public.courses (owner_id, title, source_language_id, target_language_id)
     select '00000000-0000-0000-0000-000000000001', 'Roto',
            l.id, l.id
       from public.languages l where l.locale = 'es' $$,
  '%courses_source_target_distinct%',
  'courses rechaza el mismo idioma como origen y destino'
);

select throws_like(
  $$ insert into public.courses (owner_id, title, source_language_id, target_language_id)
     select '00000000-0000-0000-0000-000000000001', '   ',
            s.id, t.id
       from public.languages s, public.languages t
      where s.locale = 'es' and t.locale = 'en-GB' $$,
  '%courses_title_length%',
  'courses rechaza un título en blanco'
);

-- Un curso válido para las pruebas de course_settings.
insert into public.courses (id, owner_id, title, source_language_id, target_language_id)
select '00000000-0000-0000-0000-0000000000c1',
       '00000000-0000-0000-0000-000000000001',
       'Inglés A1–B2',
       s.id, t.id
  from public.languages s, public.languages t
 where s.locale = 'es' and t.locale = 'en-GB';

-- --- course_settings: rangos y dueño ------------------------------------

select lives_ok(
  $$ insert into public.course_settings (course_id, user_id)
     values ('00000000-0000-0000-0000-0000000000c1',
             '00000000-0000-0000-0000-000000000001') $$,
  'course_settings acepta una fila para el dueño del curso con los valores por defecto'
);

select is(
  (select daily_new_limit from public.course_settings
    where course_id = '00000000-0000-0000-0000-0000000000c1'),
  5,
  'course_settings.daily_new_limit por defecto es 5'
);

select throws_like(
  $$ update public.course_settings set daily_new_limit = 101
     where course_id = '00000000-0000-0000-0000-0000000000c1' $$,
  '%course_settings_daily_new_limit_range%',
  'course_settings rechaza un límite diario fuera de rango'
);

select throws_like(
  $$ update public.course_settings set requested_retention = 0.50
     where course_id = '00000000-0000-0000-0000-0000000000c1' $$,
  '%course_settings_requested_retention_range%',
  'course_settings rechaza una retención objetivo fuera del rango de FSRS'
);

-- Un segundo usuario y un segundo curso, este último sin fila de settings.
insert into auth.users (id) values ('00000000-0000-0000-0000-000000000002');
insert into public.profiles (id) values ('00000000-0000-0000-0000-000000000002');
insert into public.courses (id, owner_id, title, source_language_id, target_language_id)
select '00000000-0000-0000-0000-0000000000c2',
       '00000000-0000-0000-0000-000000000001',
       'Segundo curso',
       s.id, t.id
  from public.languages s, public.languages t
 where s.locale = 'es' and t.locale = 'en-GB';

select throws_ok(
  $$ insert into public.course_settings (course_id, user_id)
     values ('00000000-0000-0000-0000-0000000000c2',
             '00000000-0000-0000-0000-000000000002') $$,
  '23503',
  null,
  'course_settings rechaza una fila cuyo user_id no es el dueño del curso (FK compuesta)'
);

select throws_ok(
  $$ insert into public.course_settings (course_id, user_id)
     values ('00000000-0000-0000-0000-0000000000c1',
             '00000000-0000-0000-0000-000000000001') $$,
  '23505',
  null,
  'course_settings rechaza una segunda fila para el mismo curso'
);

select * from finish();
rollback;
