-- LEX-5.4 — Estructura de las tablas de estudio.
--
-- Comprueba que la migración `study_schema` deja el esquema que la fase 5
-- espera: las tres tablas, sus claves, los enums, los CHECK que acotan
-- valores, las FK compuestas que atan cada fila a su dueño, y las unicidades
-- de negocio (un estado por ítem, una clave de idempotencia por dueño).
-- El aislamiento entre usuarios por RLS (dueño / no dueño) y los índices de
-- cola e historial son LEX-5.5 y no se prueban aquí; sí se prueba que la FK
-- compuesta impide enlazar contenido de dos usuarios, que es integridad
-- estructural, no política.
--
-- **Independiente del seed.** Idiomas sintéticos `zz` y UUID fijos, igual que
-- 080-library-schema.sql. Cada CHECK se prueba rechazando un valor inválido:
-- un guardián que nunca ha dicho que no no está probado.

begin;
select plan(82);

-- --- Las tres tablas existen, con clave primaria --------------------------

select has_table('public', 'learning_states', 'learning_states existe');
select has_table('public', 'study_sessions',  'study_sessions existe');
select has_table('public', 'review_logs',     'review_logs existe');

select has_pk('public', 'learning_states', 'learning_states tiene PK');
select has_pk('public', 'study_sessions',  'study_sessions tiene PK');
select has_pk('public', 'review_logs',     'review_logs tiene PK');

-- `learning_step` está (el dominio lo tiene; §13.11 lo omitió).
-- `elapsed_days` no está (deprecado en ts-fsrs, ausente del dominio).
select has_column('public', 'learning_states', 'learning_step',
  'learning_states tiene learning_step (ida/vuelta de una carta en Learning)');
select hasnt_column('public', 'learning_states', 'elapsed_days',
  'learning_states no tiene elapsed_days: deprecado en ts-fsrs, no está en el dominio');
select hasnt_column('public', 'review_logs', 'updated_at',
  'review_logs no tiene updated_at: se escribe una vez');

-- --- Enums de vocabulario cerrado -----------------------------------------

select has_type('public', 'memory_phase',          'existe el enum memory_phase');
select has_type('public', 'study_session_status',  'existe el enum study_session_status');
select has_type('public', 'review_rating',         'existe el enum review_rating');

select enum_has_labels(
  'public', 'memory_phase',
  ARRAY['new', 'learning', 'review', 'relearning']
);
select enum_has_labels(
  'public', 'study_session_status',
  ARRAY['active', 'paused', 'completed', 'abandoned']
);
select enum_has_labels(
  'public', 'review_rating',
  ARRAY['again', 'hard', 'good', 'easy']
);

-- --- RLS habilitado en las tres (políticas: LEX-5.5) ---------------------

select is(
  (select bool_and(c.relrowsecurity)
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('learning_states', 'study_sessions', 'review_logs')),
  true,
  'RLS habilitado en las tres tablas de estudio'
);
-- El juego de políticas (dueño / no-dueño, logs sin UPDATE) es LEX-5.5 /
-- 130-study-rls.sql. 120 solo comprueba que RLS está encendido.

-- --- Triggers set_updated_at: solo las tablas que se actualizan ----------

select trigger_is(
  'public', 'learning_states', 'learning_states_set_updated_at',
  'public', 'set_updated_at',
  'learning_states tiene el trigger set_updated_at'
);
select trigger_is(
  'public', 'study_sessions', 'study_sessions_set_updated_at',
  'public', 'set_updated_at',
  'study_sessions tiene el trigger set_updated_at'
);
select hasnt_trigger(
  'public', 'review_logs', 'review_logs_set_updated_at',
  'review_logs no tiene set_updated_at: no se edita'
);

-- --- FK compuestas que sostienen la pertenencia ---------------------------

select fk_ok(
  'public', 'learning_states', ARRAY['practice_item_id', 'owner_id'],
  'public', 'practice_items',  ARRAY['id', 'owner_id'],
  'learning_states (practice_item_id, owner_id) referencia practice_items (id, owner_id)'
);
select fk_ok(
  'public', 'study_sessions', ARRAY['course_id', 'owner_id'],
  'public', 'courses',        ARRAY['id', 'owner_id'],
  'study_sessions (course_id, owner_id) referencia courses (id, owner_id)'
);
select fk_ok(
  'public', 'review_logs',     ARRAY['practice_item_id', 'owner_id'],
  'public', 'practice_items',  ARRAY['id', 'owner_id'],
  'review_logs (practice_item_id, owner_id) referencia practice_items (id, owner_id)'
);
select fk_ok(
  'public', 'review_logs',     ARRAY['study_session_id', 'owner_id'],
  'public', 'study_sessions',  ARRAY['id', 'owner_id'],
  'review_logs (study_session_id, owner_id) referencia study_sessions (id, owner_id)'
);

-- --- Unicidades estructurales ---------------------------------------------

select index_is_unique(
  'public', 'learning_states', 'learning_states_owner_item_key',
  'un estado por (owner_id, practice_item_id)'
);
select index_is_unique(
  'public', 'learning_states', 'learning_states_id_owner_unique',
  'learning_states (id, owner_id) es único (destino de FK compuesta)'
);
select index_is_unique(
  'public', 'review_logs', 'review_logs_owner_idempotency_key',
  'una clave de idempotencia por dueño'
);
select index_is_unique(
  'public', 'practice_items', 'practice_items_id_owner_unique',
  'practice_items (id, owner_id) es único (destino de las FK de estudio)'
);
select index_is_unique(
  'public', 'study_sessions', 'study_sessions_id_owner_unique',
  'study_sessions (id, owner_id) es único (destino de review_logs)'
);

select has_index(
  'public', 'learning_states', 'learning_states_practice_item_id_idx',
  'índice que respalda la cascada al borrar un ítem'
);
select has_index(
  'public', 'study_sessions', 'study_sessions_course_id_idx',
  'índice que respalda la cascada al borrar un curso'
);
select has_index(
  'public', 'review_logs', 'review_logs_practice_item_id_idx',
  'índice que respalda la cascada al borrar un ítem'
);
select has_index(
  'public', 'review_logs', 'review_logs_study_session_id_idx',
  'índice que respalda el set null al borrar una sesión'
);

select col_default_is('public', 'learning_states', 'phase', 'new',
  'un estado nuevo empieza en phase = new');
select col_default_is('public', 'learning_states', 'revision', '1',
  'revision empieza en 1');
select col_default_is('public', 'study_sessions', 'status', 'active',
  'una sesión nueva empieza active');

-- --- Datos sintéticos -----------------------------------------------------

insert into auth.users (id) values
  ('a11ce000-0000-4000-8000-000000000001'),
  ('b0b0b000-0000-4000-8000-000000000002');
insert into public.profiles (id) values
  ('a11ce000-0000-4000-8000-000000000001'),
  ('b0b0b000-0000-4000-8000-000000000002');
insert into public.languages (id, code, locale, name_key) values
  ('20000000-0000-4000-8000-000000000000', 'zz', 'zz',    'language.zz'),
  ('30000000-0000-4000-8000-000000000000', 'zz', 'zz-ZZ', 'language.zz_zz');

insert into public.courses (id, owner_id, title, source_language_id, target_language_id) values
  ('c0a75e00-0000-4000-8000-00000000000a', 'a11ce000-0000-4000-8000-000000000001',
   'Curso A', '20000000-0000-4000-8000-000000000000', '30000000-0000-4000-8000-000000000000'),
  ('c0a75e00-0000-4000-8000-00000000000b', 'b0b0b000-0000-4000-8000-000000000002',
   'Curso B', '20000000-0000-4000-8000-000000000000', '30000000-0000-4000-8000-000000000000');

insert into public.concepts (id, course_id, owner_id, kind, title, summary) values
  ('c1000000-0000-4000-8000-00000000000a',
   'c0a75e00-0000-4000-8000-00000000000a', 'a11ce000-0000-4000-8000-000000000001',
   'vocabulary', 'casa', 'vivienda'),
  ('c1000000-0000-4000-8000-00000000000b',
   'c0a75e00-0000-4000-8000-00000000000b', 'b0b0b000-0000-4000-8000-000000000002',
   'vocabulary', 'house', 'dwelling');

insert into public.practice_items
  (id, concept_id, owner_id, mode, prompt_text, answer_text, config) values
  ('b1000000-0000-4000-8000-00000000000a',
   'c1000000-0000-4000-8000-00000000000a', 'a11ce000-0000-4000-8000-000000000001',
   'basic_recognition', 'casa', 'house', '{"mode":"basic_recognition"}'::jsonb),
  ('b1000000-0000-4000-8000-00000000000b',
   'c1000000-0000-4000-8000-00000000000b', 'b0b0b000-0000-4000-8000-000000000002',
   'basic_recognition', 'house', 'casa', '{"mode":"basic_recognition"}'::jsonb);

-- --- Filas válidas y unicidad de negocio ----------------------------------

select lives_ok(
  $$ insert into public.learning_states
       (id, owner_id, practice_item_id, due_at, scheduler_version, config_version)
     values ('57a7e000-0000-4000-8000-00000000000a',
             'a11ce000-0000-4000-8000-000000000001',
             'b1000000-0000-4000-8000-00000000000a',
             '2026-09-11T10:00:00Z', '5.4.2', 'v1') $$,
  'learning_states acepta un estado New del dueño del ítem'
);
select throws_ok(
  $$ insert into public.learning_states
       (owner_id, practice_item_id, due_at, scheduler_version, config_version)
     values ('a11ce000-0000-4000-8000-000000000001',
             'b1000000-0000-4000-8000-00000000000a',
             '2026-09-11T10:00:00Z', '5.4.2', 'v1') $$,
  '23505', null,
  'un segundo estado para el mismo (owner, ítem) se rechaza'
);

select lives_ok(
  $$ insert into public.study_sessions
       (id, owner_id, course_id)
     values ('5e551000-0000-4000-8000-00000000000a',
             'a11ce000-0000-4000-8000-000000000001',
             'c0a75e00-0000-4000-8000-00000000000a') $$,
  'study_sessions acepta una sesión active del dueño del curso'
);
select lives_ok(
  $$ insert into public.study_sessions
       (id, owner_id, course_id, status, started_at, ended_at)
     values ('5e551000-0000-4000-8000-0000000000aa',
             'a11ce000-0000-4000-8000-000000000001',
             'c0a75e00-0000-4000-8000-00000000000a',
             'completed', '2026-09-11T10:00:00Z', '2026-09-11T11:00:00Z') $$,
  'study_sessions acepta completed con ended_at'
);
select lives_ok(
  $$ insert into public.study_sessions
       (id, owner_id, course_id, status)
     values ('5e551000-0000-4000-8000-0000000000ab',
             'a11ce000-0000-4000-8000-000000000001',
             'c0a75e00-0000-4000-8000-00000000000a',
             'paused') $$,
  'study_sessions acepta paused sin ended_at'
);

select lives_ok(
  $$ insert into public.review_logs
       (id, owner_id, practice_item_id, study_session_id, idempotency_key,
        rating, reviewed_at, state_before, state_after, due_before, due_after,
        scheduler_version, config_version)
     values ('10c00000-0000-4000-8000-00000000000a',
             'a11ce000-0000-4000-8000-000000000001',
             'b1000000-0000-4000-8000-00000000000a',
             '5e551000-0000-4000-8000-00000000000a',
             'idem-a-1', 'good', '2026-09-11T10:00:00Z',
             '{"phase":"new"}'::jsonb, '{"phase":"learning"}'::jsonb,
             '2026-09-11T10:00:00Z', '2026-09-11T10:10:00Z',
             '5.4.2', 'v1') $$,
  'review_logs acepta un repaso del dueño del ítem y de la sesión'
);
select throws_ok(
  $$ insert into public.review_logs
       (owner_id, practice_item_id, idempotency_key,
        rating, reviewed_at, state_before, state_after, due_before, due_after,
        scheduler_version, config_version)
     values ('a11ce000-0000-4000-8000-000000000001',
             'b1000000-0000-4000-8000-00000000000a',
             'idem-a-1', 'again', '2026-09-11T10:01:00Z',
             '{"phase":"learning"}'::jsonb, '{"phase":"learning"}'::jsonb,
             '2026-09-11T10:10:00Z', '2026-09-11T10:11:00Z',
             '5.4.2', 'v1') $$,
  '23505', null,
  'la misma clave de idempotencia del mismo dueño se rechaza'
);

select lives_ok(
  $$ insert into public.learning_states
       (id, owner_id, practice_item_id, due_at, scheduler_version, config_version)
     values ('57a7e000-0000-4000-8000-00000000000b',
             'b0b0b000-0000-4000-8000-000000000002',
             'b1000000-0000-4000-8000-00000000000b',
             '2026-09-11T10:00:00Z', '5.4.2', 'v1') $$,
  'B puede tener su propio estado'
);
select lives_ok(
  $$ insert into public.review_logs
       (owner_id, practice_item_id, idempotency_key,
        rating, reviewed_at, state_before, state_after, due_before, due_after,
        scheduler_version, config_version)
     values ('b0b0b000-0000-4000-8000-000000000002',
             'b1000000-0000-4000-8000-00000000000b',
             'idem-a-1', 'good', '2026-09-11T10:00:00Z',
             '{"phase":"new"}'::jsonb, '{"phase":"learning"}'::jsonb,
             '2026-09-11T10:00:00Z', '2026-09-11T10:10:00Z',
             '5.4.2', 'v1') $$,
  'B puede reutilizar la clave de idempotencia de A: la unicidad es por dueño'
);

-- --- learning_states: cada CHECK rechaza su valor -------------------------

select throws_like(
  $$ insert into public.learning_states
       (owner_id, practice_item_id, due_at, stability, scheduler_version, config_version)
     values ('a11ce000-0000-4000-8000-000000000001',
             'b1000000-0000-4000-8000-00000000000a',
             '2026-09-11T10:00:00Z', -0.1, '5.4.2', 'v1') $$,
  '%learning_states_stability_non_negative%',
  'learning_states rechaza stability negativa'
);
select throws_like(
  $$ insert into public.learning_states
       (owner_id, practice_item_id, due_at, difficulty, scheduler_version, config_version)
     values ('a11ce000-0000-4000-8000-000000000001',
             'b1000000-0000-4000-8000-00000000000a',
             '2026-09-11T10:00:00Z', -1, '5.4.2', 'v1') $$,
  '%learning_states_difficulty_non_negative%',
  'learning_states rechaza difficulty negativa'
);
select throws_like(
  $$ insert into public.learning_states
       (owner_id, practice_item_id, due_at, scheduled_days, scheduler_version, config_version)
     values ('a11ce000-0000-4000-8000-000000000001',
             'b1000000-0000-4000-8000-00000000000a',
             '2026-09-11T10:00:00Z', -1, '5.4.2', 'v1') $$,
  '%learning_states_scheduled_days_non_negative%',
  'learning_states rechaza scheduled_days negativo'
);
select throws_like(
  $$ insert into public.learning_states
       (owner_id, practice_item_id, due_at, learning_step, scheduler_version, config_version)
     values ('a11ce000-0000-4000-8000-000000000001',
             'b1000000-0000-4000-8000-00000000000a',
             '2026-09-11T10:00:00Z', -1, '5.4.2', 'v1') $$,
  '%learning_states_learning_step_non_negative%',
  'learning_states rechaza learning_step negativo'
);
select throws_like(
  $$ insert into public.learning_states
       (owner_id, practice_item_id, due_at, reps, scheduler_version, config_version)
     values ('a11ce000-0000-4000-8000-000000000001',
             'b1000000-0000-4000-8000-00000000000a',
             '2026-09-11T10:00:00Z', -1, '5.4.2', 'v1') $$,
  '%learning_states_reps_non_negative%',
  'learning_states rechaza reps negativo'
);
select throws_like(
  $$ insert into public.learning_states
       (owner_id, practice_item_id, due_at, lapses, scheduler_version, config_version)
     values ('a11ce000-0000-4000-8000-000000000001',
             'b1000000-0000-4000-8000-00000000000a',
             '2026-09-11T10:00:00Z', -1, '5.4.2', 'v1') $$,
  '%learning_states_lapses_non_negative%',
  'learning_states rechaza lapses negativo'
);
select throws_like(
  $$ insert into public.learning_states
       (owner_id, practice_item_id, due_at, revision, scheduler_version, config_version)
     values ('a11ce000-0000-4000-8000-000000000001',
             'b1000000-0000-4000-8000-00000000000a',
             '2026-09-11T10:00:00Z', 0, '5.4.2', 'v1') $$,
  '%learning_states_revision_positive%',
  'learning_states rechaza revision < 1'
);
select throws_like(
  $$ insert into public.learning_states
       (owner_id, practice_item_id, due_at, scheduler_version, config_version)
     values ('a11ce000-0000-4000-8000-000000000001',
             'b1000000-0000-4000-8000-00000000000a',
             '2026-09-11T10:00:00Z', '   ', 'v1') $$,
  '%learning_states_scheduler_version_length%',
  'learning_states rechaza scheduler_version en blanco'
);
select throws_like(
  $$ insert into public.learning_states
       (owner_id, practice_item_id, due_at, scheduler_version, config_version)
     values ('a11ce000-0000-4000-8000-000000000001',
             'b1000000-0000-4000-8000-00000000000a',
             '2026-09-11T10:00:00Z', '5.4.2', '   ') $$,
  '%learning_states_config_version_length%',
  'learning_states rechaza config_version en blanco'
);
select throws_ok(
  $$ insert into public.learning_states
       (owner_id, practice_item_id, due_at, phase, scheduler_version, config_version)
     values ('a11ce000-0000-4000-8000-000000000001',
             'b1000000-0000-4000-8000-00000000000a',
             '2026-09-11T10:00:00Z', 'forgotten', '5.4.2', 'v1') $$,
  '22P02', null,
  'learning_states rechaza un phase fuera del enum'
);

-- --- study_sessions: cada CHECK rechaza su valor --------------------------

select throws_like(
  $$ insert into public.study_sessions
       (owner_id, course_id, status)
     values ('a11ce000-0000-4000-8000-000000000001',
             'c0a75e00-0000-4000-8000-00000000000a', 'completed') $$,
  '%study_sessions_ended_at_matches_status%',
  'study_sessions rechaza completed sin ended_at'
);
select throws_like(
  $$ insert into public.study_sessions
       (owner_id, course_id, status, started_at, ended_at)
     values ('a11ce000-0000-4000-8000-000000000001',
             'c0a75e00-0000-4000-8000-00000000000a',
             'active', '2026-09-11T10:00:00Z', '2026-09-11T11:00:00Z') $$,
  '%study_sessions_ended_at_matches_status%',
  'study_sessions rechaza active con ended_at'
);
select throws_like(
  $$ insert into public.study_sessions
       (owner_id, course_id, status, started_at, ended_at)
     values ('a11ce000-0000-4000-8000-000000000001',
             'c0a75e00-0000-4000-8000-00000000000a',
             'abandoned', '2026-09-11T11:00:00Z', '2026-09-11T10:00:00Z') $$,
  '%study_sessions_ended_after_start%',
  'study_sessions rechaza ended_at anterior a started_at'
);
select throws_like(
  $$ insert into public.study_sessions
       (owner_id, course_id, reviews_count)
     values ('a11ce000-0000-4000-8000-000000000001',
             'c0a75e00-0000-4000-8000-00000000000a', -1) $$,
  '%study_sessions_counters_non_negative%',
  'study_sessions rechaza un contador negativo'
);
select throws_like(
  $$ insert into public.study_sessions
       (owner_id, course_id, scope)
     values ('a11ce000-0000-4000-8000-000000000001',
             'c0a75e00-0000-4000-8000-00000000000a', '[]'::jsonb) $$,
  '%study_sessions_scope_is_object%',
  'study_sessions rechaza un scope que no es un objeto JSON'
);
select throws_ok(
  $$ insert into public.study_sessions
       (owner_id, course_id, status)
     values ('a11ce000-0000-4000-8000-000000000001',
             'c0a75e00-0000-4000-8000-00000000000a', 'running') $$,
  '22P02', null,
  'study_sessions rechaza un status fuera del enum'
);

-- --- review_logs: cada CHECK rechaza su valor -----------------------------

select throws_like(
  $$ insert into public.review_logs
       (owner_id, practice_item_id, idempotency_key,
        rating, reviewed_at, duration_ms, state_before, state_after,
        due_before, due_after, scheduler_version, config_version)
     values ('a11ce000-0000-4000-8000-000000000001',
             'b1000000-0000-4000-8000-00000000000a', 'bad-dur-neg',
             'good', '2026-09-11T10:00:00Z', -1,
             '{}'::jsonb, '{}'::jsonb,
             '2026-09-11T10:00:00Z', '2026-09-11T10:10:00Z', '5.4.2', 'v1') $$,
  '%review_logs_duration_ms_bounded%',
  'review_logs rechaza duration_ms negativo'
);
select throws_like(
  $$ insert into public.review_logs
       (owner_id, practice_item_id, idempotency_key,
        rating, reviewed_at, duration_ms, state_before, state_after,
        due_before, due_after, scheduler_version, config_version)
     values ('a11ce000-0000-4000-8000-000000000001',
             'b1000000-0000-4000-8000-00000000000a', 'bad-dur-big',
             'good', '2026-09-11T10:00:00Z', 3600001,
             '{}'::jsonb, '{}'::jsonb,
             '2026-09-11T10:00:00Z', '2026-09-11T10:10:00Z', '5.4.2', 'v1') $$,
  '%review_logs_duration_ms_bounded%',
  'review_logs rechaza duration_ms de más de una hora'
);
select throws_like(
  $$ insert into public.review_logs
       (owner_id, practice_item_id, idempotency_key,
        rating, reviewed_at, state_before, state_after,
        due_before, due_after, scheduler_version, config_version)
     values ('a11ce000-0000-4000-8000-000000000001',
             'b1000000-0000-4000-8000-00000000000a', 'bad-before',
             'good', '2026-09-11T10:00:00Z',
             '[]'::jsonb, '{}'::jsonb,
             '2026-09-11T10:00:00Z', '2026-09-11T10:10:00Z', '5.4.2', 'v1') $$,
  '%review_logs_state_before_is_object%',
  'review_logs rechaza state_before que no es un objeto'
);
select throws_like(
  $$ insert into public.review_logs
       (owner_id, practice_item_id, idempotency_key,
        rating, reviewed_at, state_before, state_after,
        due_before, due_after, scheduler_version, config_version)
     values ('a11ce000-0000-4000-8000-000000000001',
             'b1000000-0000-4000-8000-00000000000a', 'bad-after',
             'good', '2026-09-11T10:00:00Z',
             '{}'::jsonb, '[]'::jsonb,
             '2026-09-11T10:00:00Z', '2026-09-11T10:10:00Z', '5.4.2', 'v1') $$,
  '%review_logs_state_after_is_object%',
  'review_logs rechaza state_after que no es un objeto'
);
select throws_like(
  $$ insert into public.review_logs
       (owner_id, practice_item_id, idempotency_key,
        rating, reviewed_at, state_before, state_after,
        due_before, due_after, scheduler_version, config_version)
     values ('a11ce000-0000-4000-8000-000000000001',
             'b1000000-0000-4000-8000-00000000000a', '   ',
             'good', '2026-09-11T10:00:00Z',
             '{}'::jsonb, '{}'::jsonb,
             '2026-09-11T10:00:00Z', '2026-09-11T10:10:00Z', '5.4.2', 'v1') $$,
  '%review_logs_idempotency_key_length%',
  'review_logs rechaza una clave de idempotencia en blanco'
);
select throws_ok(
  $$ insert into public.review_logs
       (owner_id, practice_item_id, idempotency_key,
        rating, reviewed_at, state_before, state_after,
        due_before, due_after, scheduler_version, config_version)
     values ('a11ce000-0000-4000-8000-000000000001',
             'b1000000-0000-4000-8000-00000000000a', 'manual-not-a-grade',
             'manual', '2026-09-11T10:00:00Z',
             '{}'::jsonb, '{}'::jsonb,
             '2026-09-11T10:00:00Z', '2026-09-11T10:10:00Z', '5.4.2', 'v1') $$,
  '22P02', null,
  'review_logs rechaza rating manual: no es una valoración de usuario'
);

-- --- FK compuesta: no se cuelga del padre de otro usuario -----------------

select throws_ok(
  $$ insert into public.learning_states
       (owner_id, practice_item_id, due_at, scheduler_version, config_version)
     values ('a11ce000-0000-4000-8000-000000000001',
             'b1000000-0000-4000-8000-00000000000b',
             '2026-09-11T10:00:00Z', '5.4.2', 'v1') $$,
  '23503', null,
  'A no puede crear un estado sobre el ítem de B (FK compuesta)'
);
select throws_ok(
  $$ insert into public.study_sessions
       (owner_id, course_id)
     values ('a11ce000-0000-4000-8000-000000000001',
             'c0a75e00-0000-4000-8000-00000000000b') $$,
  '23503', null,
  'A no puede abrir una sesión sobre el curso de B (FK compuesta)'
);
select throws_ok(
  $$ insert into public.review_logs
       (owner_id, practice_item_id, idempotency_key,
        rating, reviewed_at, state_before, state_after,
        due_before, due_after, scheduler_version, config_version)
     values ('a11ce000-0000-4000-8000-000000000001',
             'b1000000-0000-4000-8000-00000000000b', 'cross-item',
             'good', '2026-09-11T10:00:00Z',
             '{}'::jsonb, '{}'::jsonb,
             '2026-09-11T10:00:00Z', '2026-09-11T10:10:00Z', '5.4.2', 'v1') $$,
  '23503', null,
  'A no puede registrar un repaso sobre el ítem de B (FK compuesta)'
);
select lives_ok(
  $$ insert into public.study_sessions
       (id, owner_id, course_id)
     values ('5e551000-0000-4000-8000-00000000000b',
             'b0b0b000-0000-4000-8000-000000000002',
             'c0a75e00-0000-4000-8000-00000000000b') $$,
  'fixture: sesión de B'
);
select throws_ok(
  $$ insert into public.review_logs
       (owner_id, practice_item_id, study_session_id, idempotency_key,
        rating, reviewed_at, state_before, state_after,
        due_before, due_after, scheduler_version, config_version)
     values ('a11ce000-0000-4000-8000-000000000001',
             'b1000000-0000-4000-8000-00000000000a',
             '5e551000-0000-4000-8000-00000000000b', 'cross-session',
             'good', '2026-09-11T10:00:00Z',
             '{}'::jsonb, '{}'::jsonb,
             '2026-09-11T10:00:00Z', '2026-09-11T10:10:00Z', '5.4.2', 'v1') $$,
  '23503', null,
  'A no puede colgar un repaso de la sesión de B (FK compuesta)'
);

-- --- Archivar un ítem no borra la memoria (Q-006 / LEX-5.6) ---------------

select lives_ok(
  $$ update public.practice_items
        set archived_at = '2026-09-11T12:00:00Z'
      where id = 'b1000000-0000-4000-8000-00000000000a' $$,
  'archivar un ítem no falla'
);
select is(
  (select count(*)::int from public.learning_states
    where practice_item_id = 'b1000000-0000-4000-8000-00000000000a'),
  1,
  'archivar un ítem no borra su learning_state'
);
select is(
  (select count(*)::int from public.review_logs
    where practice_item_id = 'b1000000-0000-4000-8000-00000000000a'),
  1,
  'archivar un ítem no borra sus review_logs'
);

-- --- Cascada al borrar el ítem; set null al borrar la sesión --------------

insert into public.concepts (id, course_id, owner_id, kind, title, summary) values
  ('c1000000-0000-4000-8000-0000000000ca',
   'c0a75e00-0000-4000-8000-00000000000a', 'a11ce000-0000-4000-8000-000000000001',
   'vocabulary', 'temp', 'temp');
insert into public.practice_items
  (id, concept_id, owner_id, mode, prompt_text, answer_text, config) values
  ('b1000000-0000-4000-8000-0000000000ca',
   'c1000000-0000-4000-8000-0000000000ca', 'a11ce000-0000-4000-8000-000000000001',
   'basic_recall', 'p', 'a', '{"mode":"basic_recall"}'::jsonb);
insert into public.learning_states
  (id, owner_id, practice_item_id, due_at, scheduler_version, config_version)
values
  ('57a7e000-0000-4000-8000-0000000000ca',
   'a11ce000-0000-4000-8000-000000000001',
   'b1000000-0000-4000-8000-0000000000ca',
   '2026-09-11T10:00:00Z', '5.4.2', 'v1');
insert into public.review_logs
  (id, owner_id, practice_item_id, study_session_id, idempotency_key,
   rating, reviewed_at, state_before, state_after, due_before, due_after,
   scheduler_version, config_version)
values
  ('10c00000-0000-4000-8000-0000000000ca',
   'a11ce000-0000-4000-8000-000000000001',
   'b1000000-0000-4000-8000-0000000000ca',
   '5e551000-0000-4000-8000-00000000000a',
   'idem-cascade-item', 'good', '2026-09-11T10:00:00Z',
   '{}'::jsonb, '{}'::jsonb,
   '2026-09-11T10:00:00Z', '2026-09-11T10:10:00Z',
   '5.4.2', 'v1');

select lives_ok(
  $$ delete from public.practice_items
      where id = 'b1000000-0000-4000-8000-0000000000ca' $$,
  'borrar un ítem no falla aunque tenga estado y log'
);
select is_empty(
  $$ select 1 from public.learning_states
      where practice_item_id = 'b1000000-0000-4000-8000-0000000000ca' $$,
  'al borrar el ítem se borra su learning_state (cascada)'
);
select is_empty(
  $$ select 1 from public.review_logs
      where practice_item_id = 'b1000000-0000-4000-8000-0000000000ca' $$,
  'al borrar el ítem se borra su review_log (cascada)'
);

insert into public.review_logs
  (id, owner_id, practice_item_id, study_session_id, idempotency_key,
   rating, reviewed_at, state_before, state_after, due_before, due_after,
   scheduler_version, config_version)
values
  ('10c00000-0000-4000-8000-0000000000cb',
   'a11ce000-0000-4000-8000-000000000001',
   'b1000000-0000-4000-8000-00000000000a',
   '5e551000-0000-4000-8000-00000000000a',
   'idem-cascade-session', 'hard', '2026-09-11T10:20:00Z',
   '{}'::jsonb, '{}'::jsonb,
   '2026-09-11T10:10:00Z', '2026-09-11T10:26:00Z',
   '5.4.2', 'v1');

select lives_ok(
  $$ delete from public.study_sessions
      where id = '5e551000-0000-4000-8000-00000000000a' $$,
  'borrar una sesión no falla aunque tenga logs'
);
select is(
  (select study_session_id from public.review_logs
    where id = '10c00000-0000-4000-8000-0000000000cb'),
  null,
  'al borrar la sesión el log sobrevive con study_session_id nulo (historial)'
);
select is(
  (select count(*)::int from public.review_logs
    where id = '10c00000-0000-4000-8000-0000000000cb'),
  1,
  'el log sigue existiendo después de borrar la sesión'
);

-- --- Cascada al borrar el curso (sesiones) --------------------------------

insert into public.courses (id, owner_id, title, source_language_id, target_language_id) values
  ('c0a75e00-0000-4000-8000-0000000000cc', 'a11ce000-0000-4000-8000-000000000001',
   'Curso desechable', '20000000-0000-4000-8000-000000000000',
   '30000000-0000-4000-8000-000000000000');
insert into public.study_sessions (id, owner_id, course_id) values
  ('5e551000-0000-4000-8000-0000000000cc',
   'a11ce000-0000-4000-8000-000000000001',
   'c0a75e00-0000-4000-8000-0000000000cc');

select lives_ok(
  $$ delete from public.courses
      where id = 'c0a75e00-0000-4000-8000-0000000000cc' $$,
  'borrar un curso no falla aunque tenga sesiones'
);
select is_empty(
  $$ select 1 from public.study_sessions
      where course_id = 'c0a75e00-0000-4000-8000-0000000000cc' $$,
  'al borrar el curso se borran sus study_sessions (cascada)'
);

select * from finish();
rollback;
