-- LEX-2.9 — `profiles.active_course_id` y su aislamiento.
--
-- Autocontenido (como 020/040/050): crea sus propios idiomas sintéticos y dos
-- usuarios con un curso cada uno, y luego se convierte en `authenticated`.
--
-- Lo que se fija aquí: **un usuario no puede poner como curso activo el curso
-- de otro**, ni siquiera conociendo su UUID. No es una comprobación en la
-- lectura —es la FK compuesta `(active_course_id, id) -> courses (id,
-- owner_id)` la que lo impide en la escritura, igual que `course_settings` no
-- admite una fila para quien no es el dueño—. Y `on delete set null` limpia el
-- puntero solo.

begin;
select plan(6);

-- Fixture (rol de migración: BYPASSRLS). UUID solo con dígitos hex.
insert into auth.users (id) values
  ('ac000001-0000-4000-8000-000000000001'),   -- user A
  ('ac000002-0000-4000-8000-000000000002');   -- user B

insert into public.languages (id, code, locale, name_key) values
  ('acef0001-0000-4000-8000-000000000001', 'zz', 'zz', 'lang.zz'),
  ('acef0002-0000-4000-8000-000000000002', 'zy', 'zy', 'lang.zy');

insert into public.profiles (id) values
  ('ac000001-0000-4000-8000-000000000001'),
  ('ac000002-0000-4000-8000-000000000002');

insert into public.courses (id, owner_id, title, source_language_id, target_language_id) values
  ('ac0c0001-0000-4000-8000-000000000001', 'ac000001-0000-4000-8000-000000000001', 'Curso A',
   'acef0001-0000-4000-8000-000000000001', 'acef0002-0000-4000-8000-000000000002'),
  ('ac0c0002-0000-4000-8000-000000000002', 'ac000002-0000-4000-8000-000000000002', 'Curso B',
   'acef0001-0000-4000-8000-000000000001', 'acef0002-0000-4000-8000-000000000002');

-- --- La columna existe y arranca en NULL --------------------------------------

select col_is_null('public', 'profiles', 'active_course_id',
  'profiles.active_course_id admite NULL');

select is(
  (select active_course_id from public.profiles
    where id = 'ac000001-0000-4000-8000-000000000001'),
  null,
  'active_course_id arranca en NULL'
);

-- ===========================================================================
-- Como user A.
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"ac000001-0000-4000-8000-000000000001","role":"authenticated"}';

-- A fija SU curso como activo: se permite.
update public.profiles
  set active_course_id = 'ac0c0001-0000-4000-8000-000000000001'
  where id = 'ac000001-0000-4000-8000-000000000001';

select is(
  (select active_course_id from public.profiles
    where id = 'ac000001-0000-4000-8000-000000000001'),
  'ac0c0001-0000-4000-8000-000000000001'::uuid,
  'A puede poner su propio curso como activo'
);

-- A intenta poner el curso de B como activo: la FK compuesta lo rechaza
-- —(curso de B, A) no está en courses (id, owner_id)—.
select throws_ok(
  $$ update public.profiles
       set active_course_id = 'ac0c0002-0000-4000-8000-000000000002'
       where id = 'ac000001-0000-4000-8000-000000000001' $$,
  '23503',
  null,
  'A no puede poner el curso de B como activo (FK compuesta, no la lectura)'
);

select is(
  (select active_course_id from public.profiles
    where id = 'ac000001-0000-4000-8000-000000000001'),
  'ac0c0001-0000-4000-8000-000000000001'::uuid,
  'el intento fallido no cambió el curso activo de A'
);

-- (Que A no pueda escribir la fila de B lo cubre `profiles_update_own` en 040.)

-- ===========================================================================
-- `on delete set null`: si el curso desaparece, el puntero se limpia.
-- ===========================================================================

reset role;

delete from public.courses where id = 'ac0c0001-0000-4000-8000-000000000001';

select is(
  (select active_course_id from public.profiles
    where id = 'ac000001-0000-4000-8000-000000000001'),
  null,
  'al borrar el curso, profiles.active_course_id vuelve a NULL (no bloquea el borrado)'
);

select * from finish();
rollback;
