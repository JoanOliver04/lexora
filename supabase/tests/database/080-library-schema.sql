-- LEX-3.2 — Estructura de las tablas de biblioteca.
--
-- Comprueba que la migración `library_schema` deja el esquema que la fase 3
-- espera: las seis tablas, sus claves, los enums, la columna generada
-- `canonical_key`, los CHECK que acotan valores y las FK compuestas que atan
-- cada fila a su dueño. El aislamiento entre usuarios por RLS (dueño / no
-- dueño) y los índices de consulta son LEX-3.3 y no se prueban aquí; sí se
-- prueba que la FK compuesta impide enlazar contenido de dos usuarios, que es
-- integridad estructural, no política.
--
-- **Independiente del seed.** Idiomas sintéticos `zz` y UUID fijos, igual que
-- 020-identity-course-schema.sql. Cada CHECK se prueba rechazando un valor
-- inválido: un guardián que nunca ha dicho que no no está probado.

begin;
select plan(67);

-- --- Las seis tablas existen, con clave primaria --------------------------

select has_table('public', 'decks',          'decks existe');
select has_table('public', 'concepts',       'concepts existe');
select has_table('public', 'deck_concepts',  'deck_concepts existe');
select has_table('public', 'practice_items', 'practice_items existe');
select has_table('public', 'tags',           'tags existe');
select has_table('public', 'concept_tags',   'concept_tags existe');

select has_pk('public', 'decks',          'decks tiene PK');
select has_pk('public', 'concepts',       'concepts tiene PK');
select has_pk('public', 'deck_concepts',  'deck_concepts tiene PK');
select has_pk('public', 'practice_items', 'practice_items tiene PK');
select has_pk('public', 'tags',           'tags tiene PK');
select has_pk('public', 'concept_tags',   'concept_tags tiene PK');

select col_is_pk(
  'public', 'deck_concepts', ARRAY['deck_id', 'concept_id'],
  'la PK de deck_concepts es (deck_id, concept_id): un concepto en un mazo, una vez'
);
select col_is_pk(
  'public', 'concept_tags', ARRAY['concept_id', 'tag_id'],
  'la PK de concept_tags es (concept_id, tag_id)'
);

-- --- Enums de vocabulario cerrado ---------------------------------------------

select has_type('public', 'deck_category',  'existe el enum deck_category');
select has_type('public', 'concept_kind',   'existe el enum concept_kind');
select has_type('public', 'practice_mode',  'existe el enum practice_mode');

-- practice_mode reserva los siete modos de §13.9; deck_category incluye
-- professional (Q-005: categoría, no nivel).
select enum_has_labels(
  'public', 'practice_mode',
  ARRAY['basic_recognition', 'basic_recall', 'cloze', 'listening_dictation',
        'guided_production', 'free_production', 'pronunciation']
);
select enum_has_labels(
  'public', 'deck_category',
  ARRAY['vocabulary', 'grammar', 'communicative_function', 'pronunciation',
        'professional', 'mixed']
);

-- --- FK compuestas que sostienen la pertenencia ---------------------------

select fk_ok(
  'public', 'decks',   ARRAY['course_id', 'owner_id'],
  'public', 'courses', ARRAY['id', 'owner_id'],
  'decks (course_id, owner_id) referencia courses (id, owner_id)'
);
select fk_ok(
  'public', 'concepts', ARRAY['course_id', 'owner_id'],
  'public', 'courses',  ARRAY['id', 'owner_id'],
  'concepts (course_id, owner_id) referencia courses (id, owner_id)'
);
select fk_ok(
  'public', 'deck_concepts', ARRAY['deck_id', 'owner_id'],
  'public', 'decks',         ARRAY['id', 'owner_id'],
  'deck_concepts (deck_id, owner_id) referencia decks (id, owner_id)'
);
select fk_ok(
  'public', 'deck_concepts', ARRAY['concept_id', 'owner_id'],
  'public', 'concepts',      ARRAY['id', 'owner_id'],
  'deck_concepts (concept_id, owner_id) referencia concepts (id, owner_id)'
);
select fk_ok(
  'public', 'practice_items', ARRAY['concept_id', 'owner_id'],
  'public', 'concepts',       ARRAY['id', 'owner_id'],
  'practice_items (concept_id, owner_id) referencia concepts (id, owner_id)'
);
select fk_ok(
  'public', 'tags',    ARRAY['course_id', 'owner_id'],
  'public', 'courses', ARRAY['id', 'owner_id'],
  'tags (course_id, owner_id) referencia courses (id, owner_id)'
);
select fk_ok(
  'public', 'concept_tags', ARRAY['concept_id', 'owner_id'],
  'public', 'concepts',     ARRAY['id', 'owner_id'],
  'concept_tags (concept_id, owner_id) referencia concepts (id, owner_id)'
);
select fk_ok(
  'public', 'concept_tags', ARRAY['tag_id', 'owner_id'],
  'public', 'tags',         ARRAY['id', 'owner_id'],
  'concept_tags (tag_id, owner_id) referencia tags (id, owner_id)'
);

-- --- RLS habilitado en las seis (políticas: LEX-3.3) ---------------------

select is(
  (select bool_and(c.relrowsecurity)
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('decks', 'concepts', 'deck_concepts',
                        'practice_items', 'tags', 'concept_tags')),
  true,
  'RLS habilitado en las seis tablas de biblioteca'
);

-- --- Trigger set_updated_at en las cinco tablas con updated_at ----------
--
-- Sin esto, un `create trigger` que nombrara mal la función o la tabla se
-- aplicaría igual y pasaría el resto de aserciones. concept_tags no lo lleva
-- (no tiene carga mutable).

select trigger_is('public', 'decks',          'decks_set_updated_at',
                   'public', 'set_updated_at', 'decks tiene el trigger set_updated_at');
select trigger_is('public', 'concepts',       'concepts_set_updated_at',
                   'public', 'set_updated_at', 'concepts tiene el trigger set_updated_at');
select trigger_is('public', 'deck_concepts',  'deck_concepts_set_updated_at',
                   'public', 'set_updated_at', 'deck_concepts tiene el trigger set_updated_at');
select trigger_is('public', 'practice_items', 'practice_items_set_updated_at',
                   'public', 'set_updated_at', 'practice_items tiene el trigger set_updated_at');
select trigger_is('public', 'tags',           'tags_set_updated_at',
                   'public', 'set_updated_at', 'tags tiene el trigger set_updated_at');

-- --- Datos sintéticos -----------------------------------------------------

insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002');
insert into public.profiles (id) values
  ('00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002');
insert into public.languages (code, locale, name_key) values
  ('zz', 'zz',    'language.zz'),
  ('zz', 'zz-ZZ', 'language.zz_zz');

insert into public.courses (id, owner_id, title, source_language_id, target_language_id)
select '00000000-0000-0000-0000-0000000000c1',
       '00000000-0000-0000-0000-000000000001', 'Curso de user1',
       s.id, t.id
  from public.languages s, public.languages t
 where s.locale = 'zz' and t.locale = 'zz-ZZ';
insert into public.courses (id, owner_id, title, source_language_id, target_language_id)
select '00000000-0000-0000-0000-0000000000c2',
       '00000000-0000-0000-0000-000000000002', 'Curso de user2',
       s.id, t.id
  from public.languages s, public.languages t
 where s.locale = 'zz' and t.locale = 'zz-ZZ';

insert into public.decks (id, course_id, owner_id, title)
values ('00000000-0000-0000-0000-0000000000d1',
        '00000000-0000-0000-0000-0000000000c1',
        '00000000-0000-0000-0000-000000000001', 'Mazo de user1');
insert into public.concepts (id, course_id, owner_id, kind, title, summary)
values ('00000000-0000-0000-0000-0000000000e1',
        '00000000-0000-0000-0000-0000000000c1',
        '00000000-0000-0000-0000-000000000001', 'vocabulary',
        '  Casa   Verde ', 'una casa de color verde');
insert into public.concepts (id, course_id, owner_id, kind, title, summary)
values ('00000000-0000-0000-0000-0000000000e2',
        '00000000-0000-0000-0000-0000000000c1',
        '00000000-0000-0000-0000-000000000001', 'vocabulary',
        'Águila Real', 'ave rapaz');

insert into public.decks (id, course_id, owner_id, title)
values ('00000000-0000-0000-0000-0000000000d9',
        '00000000-0000-0000-0000-0000000000c2',
        '00000000-0000-0000-0000-000000000002', 'Mazo de user2');
insert into public.concepts (id, course_id, owner_id, kind, title, summary)
values ('00000000-0000-0000-0000-0000000000e9',
        '00000000-0000-0000-0000-0000000000c2',
        '00000000-0000-0000-0000-000000000002', 'vocabulary',
        'concepto ajeno', 'de user2');

-- --- concepts.canonical_key: columna generada, sin deriva ----------------

select is(
  (select canonical_key from public.concepts
    where id = '00000000-0000-0000-0000-0000000000e1'),
  'casa verde',
  'canonical_key recorta, colapsa espacios y pasa a minúsculas (coincide con canonicalKey del dominio)'
);
select is(
  (select canonical_key from public.concepts
    where id = '00000000-0000-0000-0000-0000000000e2'),
  'águila real',
  'canonical_key conserva los acentos: no pliega á→a'
);
select throws_ok(
  $$ insert into public.concepts (course_id, owner_id, kind, title, summary, canonical_key)
     values ('00000000-0000-0000-0000-0000000000c1',
             '00000000-0000-0000-0000-000000000001', 'vocabulary',
             'x', 'y', 'valor a mano') $$,
  '428C9',
  null,
  'canonical_key no admite un valor explícito: es GENERATED ALWAYS'
);

-- --- decks: CHECK de longitud y posición --------------------------------

select throws_like(
  $$ insert into public.decks (course_id, owner_id, title)
     values ('00000000-0000-0000-0000-0000000000c1',
             '00000000-0000-0000-0000-000000000001', '   ') $$,
  '%decks_title_length%',
  'decks rechaza un título en blanco'
);
select throws_like(
  $$ insert into public.decks (course_id, owner_id, title, description)
     values ('00000000-0000-0000-0000-0000000000c1',
             '00000000-0000-0000-0000-000000000001', 'ok',
             repeat('x', 501)) $$,
  '%decks_description_length%',
  'decks rechaza una descripción de más de 500 caracteres'
);
select throws_like(
  $$ insert into public.decks (course_id, owner_id, title, position)
     values ('00000000-0000-0000-0000-0000000000c1',
             '00000000-0000-0000-0000-000000000001', 'ok', -1) $$,
  '%decks_position_non_negative%',
  'decks rechaza una posición negativa'
);

-- --- concepts: CHECK de longitud y metadata objeto ---------------------

select throws_like(
  $$ insert into public.concepts (course_id, owner_id, kind, title, summary)
     values ('00000000-0000-0000-0000-0000000000c1',
             '00000000-0000-0000-0000-000000000001', 'vocabulary', 'ok', '  ') $$,
  '%concepts_summary_length%',
  'concepts rechaza un resumen en blanco'
);
select throws_like(
  $$ insert into public.concepts (course_id, owner_id, kind, title, summary, explanation)
     values ('00000000-0000-0000-0000-0000000000c1',
             '00000000-0000-0000-0000-000000000001', 'vocabulary', 'ok', 'ok',
             repeat('x', 4001)) $$,
  '%concepts_explanation_length%',
  'concepts rechaza una explicación de más de 4000 caracteres'
);
select throws_like(
  $$ insert into public.concepts (course_id, owner_id, kind, title, summary, metadata)
     values ('00000000-0000-0000-0000-0000000000c1',
             '00000000-0000-0000-0000-000000000001', 'vocabulary', 'ok', 'ok',
             '[]'::jsonb) $$,
  '%concepts_metadata_is_object%',
  'concepts rechaza metadata que no es un objeto JSON'
);
select throws_ok(
  $$ insert into public.concepts (course_id, owner_id, kind, title, summary)
     values ('00000000-0000-0000-0000-0000000000c1',
             '00000000-0000-0000-0000-000000000001', 'no-existe', 'ok', 'ok') $$,
  '22P02',
  null,
  'concepts rechaza un kind fuera del enum'
);

-- --- practice_items: CHECK de texto y de config discriminada -----------

select throws_like(
  $$ insert into public.practice_items
       (concept_id, owner_id, mode, prompt_text, answer_text, config)
     values ('00000000-0000-0000-0000-0000000000e1',
             '00000000-0000-0000-0000-000000000001', 'basic_recognition',
             '  ', 'respuesta', '{"mode":"basic_recognition"}'::jsonb) $$,
  '%practice_items_prompt_text_length%',
  'practice_items rechaza un enunciado en blanco'
);
select throws_like(
  $$ insert into public.practice_items
       (concept_id, owner_id, mode, prompt_text, answer_text, config)
     values ('00000000-0000-0000-0000-0000000000e1',
             '00000000-0000-0000-0000-000000000001', 'basic_recognition',
             'enunciado', repeat('x', 501), '{"mode":"basic_recognition"}'::jsonb) $$,
  '%practice_items_answer_text_length%',
  'practice_items rechaza una respuesta de más de 500 caracteres'
);
select throws_like(
  $$ insert into public.practice_items
       (concept_id, owner_id, mode, prompt_text, answer_text, config)
     values ('00000000-0000-0000-0000-0000000000e1',
             '00000000-0000-0000-0000-000000000001', 'basic_recognition',
             'enunciado', 'respuesta', '[]'::jsonb) $$,
  '%practice_items_config_is_object%',
  'practice_items rechaza config que no es un objeto JSON'
);
select throws_like(
  $$ insert into public.practice_items
       (concept_id, owner_id, mode, prompt_text, answer_text, config)
     values ('00000000-0000-0000-0000-0000000000e1',
             '00000000-0000-0000-0000-000000000001', 'basic_recognition',
             'enunciado', 'respuesta', '{}'::jsonb) $$,
  '%practice_items_config_mode_matches%',
  'practice_items rechaza un config vacío: le falta la clave mode'
);
select throws_like(
  $$ insert into public.practice_items
       (concept_id, owner_id, mode, prompt_text, answer_text, config)
     values ('00000000-0000-0000-0000-0000000000e1',
             '00000000-0000-0000-0000-000000000001', 'basic_recall',
             'enunciado', 'respuesta', '{"mode":"cloze"}'::jsonb) $$,
  '%practice_items_config_mode_matches%',
  'practice_items rechaza un config cuyo mode no coincide con la columna mode'
);
select lives_ok(
  $$ insert into public.practice_items
       (concept_id, owner_id, mode, prompt_text, answer_text, config)
     values ('00000000-0000-0000-0000-0000000000e1',
             '00000000-0000-0000-0000-000000000001', 'cloze',
             'La casa es ___', 'verde',
             '{"mode":"cloze","answers":["verde"]}'::jsonb) $$,
  'practice_items acepta un ítem cloze cuyo config cuadra con el modo'
);

-- --- tags: CHECK de longitud y de segmento vacío ----------------------

select lives_ok(
  $$ insert into public.tags (course_id, owner_id, normalized_name, display_name)
     values ('00000000-0000-0000-0000-0000000000c1',
             '00000000-0000-0000-0000-000000000001', 'gramática::tiempos', 'Gramática::Tiempos') $$,
  'tags acepta una jerarquía :: bien formada'
);
select throws_like(
  $$ insert into public.tags (course_id, owner_id, normalized_name, display_name)
     values ('00000000-0000-0000-0000-0000000000c1',
             '00000000-0000-0000-0000-000000000001', 'a::', 'A::') $$,
  '%tags_no_empty_segment%',
  'tags rechaza un segmento vacío al final (a::)'
);
select throws_like(
  $$ insert into public.tags (course_id, owner_id, normalized_name, display_name)
     values ('00000000-0000-0000-0000-0000000000c1',
             '00000000-0000-0000-0000-000000000001', '::b', '::B') $$,
  '%tags_no_empty_segment%',
  'tags rechaza un segmento vacío al principio (::b)'
);
select throws_like(
  $$ insert into public.tags (course_id, owner_id, normalized_name, display_name)
     values ('00000000-0000-0000-0000-0000000000c1',
             '00000000-0000-0000-0000-000000000001', 'a::::b', 'A::::B') $$,
  '%tags_no_empty_segment%',
  'tags rechaza un segmento vacío en medio (a::::b)'
);
select throws_like(
  $$ insert into public.tags (course_id, owner_id, normalized_name, display_name)
     values ('00000000-0000-0000-0000-0000000000c1',
             '00000000-0000-0000-0000-000000000001', repeat('x', 201), 'Largo') $$,
  '%tags_normalized_name_length%',
  'tags rechaza un nombre normalizado de más de 200 caracteres'
);
-- La unicidad de normalized_name por curso es LEX-3.3: hoy dos etiquetas
-- equivalentes en el mismo curso se aceptan. Esta asercion marca la ausencia
-- deliberada; LEX-3.3 la sustituira por un throws.
select lives_ok(
  $$ insert into public.tags (course_id, owner_id, normalized_name, display_name)
     values ('00000000-0000-0000-0000-0000000000c1',
             '00000000-0000-0000-0000-000000000001', 'gramática::tiempos', 'gramatica::tiempos') $$,
  'tags todavía no impone unicidad de normalized_name por curso (LEX-3.3)'
);

-- --- deck_concepts: par único y mismo dueño --------------------------

select lives_ok(
  $$ insert into public.deck_concepts (deck_id, concept_id, owner_id)
     values ('00000000-0000-0000-0000-0000000000d1',
             '00000000-0000-0000-0000-0000000000e1',
             '00000000-0000-0000-0000-000000000001') $$,
  'deck_concepts acepta enlazar un mazo y un concepto del mismo dueño'
);
select throws_ok(
  $$ insert into public.deck_concepts (deck_id, concept_id, owner_id)
     values ('00000000-0000-0000-0000-0000000000d1',
             '00000000-0000-0000-0000-0000000000e1',
             '00000000-0000-0000-0000-000000000001') $$,
  '23505',
  null,
  'deck_concepts rechaza el mismo (deck_id, concept_id) dos veces'
);
select throws_ok(
  $$ insert into public.deck_concepts (deck_id, concept_id, owner_id)
     values ('00000000-0000-0000-0000-0000000000d1',
             '00000000-0000-0000-0000-0000000000e9',
             '00000000-0000-0000-0000-000000000001') $$,
  '23503',
  null,
  'deck_concepts no puede enlazar mi mazo con el concepto de otro usuario (FK compuesta)'
);
select lives_ok(
  $$ update public.deck_concepts set position = 1
     where deck_id = '00000000-0000-0000-0000-0000000000d1'
       and concept_id = '00000000-0000-0000-0000-0000000000e1' $$,
  'deck_concepts acepta actualizar position (y dispara set_updated_at)'
);

-- --- practice_items: no se cuelga del concepto de otro --------------

select throws_ok(
  $$ insert into public.practice_items
       (concept_id, owner_id, mode, prompt_text, answer_text, config)
     values ('00000000-0000-0000-0000-0000000000e9',
             '00000000-0000-0000-0000-000000000001', 'basic_recognition',
             'enunciado', 'respuesta', '{"mode":"basic_recognition"}'::jsonb) $$,
  '23503',
  null,
  'practice_items no puede colgar de un concepto de otro usuario (FK compuesta)'
);

-- --- concept_tags: mismo dueño para concepto y etiqueta ------------

insert into public.tags (id, course_id, owner_id, normalized_name, display_name)
values ('00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000c1',
        '00000000-0000-0000-0000-000000000001', 'nivel::a1', 'Nivel::A1');

select lives_ok(
  $$ insert into public.concept_tags (concept_id, tag_id, owner_id)
     values ('00000000-0000-0000-0000-0000000000e1',
             '00000000-0000-0000-0000-0000000000a1',
             '00000000-0000-0000-0000-000000000001') $$,
  'concept_tags acepta un concepto y una etiqueta del mismo dueño'
);
select throws_ok(
  $$ insert into public.concept_tags (concept_id, tag_id, owner_id)
     values ('00000000-0000-0000-0000-0000000000e9',
             '00000000-0000-0000-0000-0000000000a1',
             '00000000-0000-0000-0000-000000000001') $$,
  '23503',
  null,
  'concept_tags no puede etiquetar el concepto de otro usuario (FK compuesta)'
);

-- --- Cascada deliberada: borrar el curso se lleva su biblioteca -----

insert into public.courses (id, owner_id, title, source_language_id, target_language_id)
select '00000000-0000-0000-0000-0000000000c3',
       '00000000-0000-0000-0000-000000000001', 'Curso desechable',
       s.id, t.id
  from public.languages s, public.languages t
 where s.locale = 'zz' and t.locale = 'zz-ZZ';
insert into public.decks (id, course_id, owner_id, title)
values ('00000000-0000-0000-0000-0000000000d3',
        '00000000-0000-0000-0000-0000000000c3',
        '00000000-0000-0000-0000-000000000001', 'Mazo desechable');
insert into public.concepts (id, course_id, owner_id, kind, title, summary)
values ('00000000-0000-0000-0000-0000000000e3',
        '00000000-0000-0000-0000-0000000000c3',
        '00000000-0000-0000-0000-000000000001', 'vocabulary', 'temp', 'temp');
insert into public.deck_concepts (deck_id, concept_id, owner_id)
values ('00000000-0000-0000-0000-0000000000d3',
        '00000000-0000-0000-0000-0000000000e3',
        '00000000-0000-0000-0000-000000000001');
insert into public.practice_items
  (concept_id, owner_id, mode, prompt_text, answer_text, config)
values ('00000000-0000-0000-0000-0000000000e3',
        '00000000-0000-0000-0000-000000000001', 'basic_recall',
        'p', 'a', '{"mode":"basic_recall"}'::jsonb);

select lives_ok(
  $$ delete from public.courses where id = '00000000-0000-0000-0000-0000000000c3' $$,
  'borrar un curso no falla aunque tenga mazos, conceptos, enlaces e ítems'
);
select is_empty(
  $$ select 1 from public.decks where course_id = '00000000-0000-0000-0000-0000000000c3' $$,
  'al borrar el curso se borran sus mazos (cascada)'
);
select is_empty(
  $$ select 1 from public.concepts where course_id = '00000000-0000-0000-0000-0000000000c3' $$,
  'al borrar el curso se borran sus conceptos (cascada)'
);
select is_empty(
  $$ select 1 from public.deck_concepts
     where deck_id = '00000000-0000-0000-0000-0000000000d3' $$,
  'al borrar el curso se borran los enlaces del mazo (cascada en dos saltos)'
);
select is_empty(
  $$ select 1 from public.practice_items
     where concept_id = '00000000-0000-0000-0000-0000000000e3' $$,
  'al borrar el curso se borran los ítems de sus conceptos (cascada en dos saltos)'
);

select * from finish();
rollback;
