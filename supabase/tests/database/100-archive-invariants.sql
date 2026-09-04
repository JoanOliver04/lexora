-- LEX-3.8 — Invariantes de archivado y borrado controlado.
--
-- No prueba pantallas ni casos de uso (eso ya está en los tests de LEX-3.5…
-- 3.7): prueba, a nivel de base de datos, que la política declarada en
-- DATA_MODEL.md se cumple de verdad y no por casualidad:
--
--   · archivar (`archived_at = now()`) es un UPDATE, nunca borra ni desliga
--     nada — "no se destruyen referencias";
--   · cada entidad archivable es dueña de su propio `archived_at`: archivar
--     un mazo no archiva sus conceptos, archivar un concepto no archiva sus
--     ítems ni el mazo que lo contiene — "sin cascada" (Q-006, opción 1,
--     recomendada y ya construida desde LEX-3.4);
--   · restaurar (`archived_at = null`) no necesita recrear nada — los
--     enlaces y filas nunca se tocaron — "reactivación segura";
--   · archivar/restaurar dos veces seguidas no falla — no hay CHECK ni
--     trigger que lo bloquee;
--   · `tags` no tiene `archived_at`: se borra de verdad (LEX-3.4/3.6), y
--     borrarla sí cascada sus enlaces `concept_tags` — contraste deliberado
--     con el resto, para que quede probado y no solo dicho.
--
-- Independiente del seed: usuario e idiomas `zz` propios, como 080/090.

begin;
select plan(26);

insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000b0');
insert into public.profiles (id) values ('00000000-0000-0000-0000-0000000000b0');
insert into public.languages (code, locale, name_key) values
  ('zz', 'zz',    'language.zz'),
  ('zz', 'zz-ZZ', 'language.zz_zz');

insert into public.courses (id, owner_id, title, source_language_id, target_language_id)
select '00000000-0000-0000-0000-0000000000c0',
       '00000000-0000-0000-0000-0000000000b0', 'Curso de archivado',
       s.id, t.id
  from public.languages s, public.languages t
 where s.locale = 'zz' and t.locale = 'zz-ZZ';

insert into public.decks (id, course_id, owner_id, title)
values ('00000000-0000-0000-0000-0000000000d0',
        '00000000-0000-0000-0000-0000000000c0',
        '00000000-0000-0000-0000-0000000000b0', 'Mazo archivable');

insert into public.concepts (id, course_id, owner_id, kind, title, summary)
values ('00000000-0000-0000-0000-0000000000e0',
        '00000000-0000-0000-0000-0000000000c0',
        '00000000-0000-0000-0000-0000000000b0', 'vocabulary',
        'concepto archivable', 'resumen');

insert into public.deck_concepts (deck_id, concept_id, owner_id)
values ('00000000-0000-0000-0000-0000000000d0',
        '00000000-0000-0000-0000-0000000000e0',
        '00000000-0000-0000-0000-0000000000b0');

insert into public.tags (id, course_id, owner_id, normalized_name, display_name)
values ('00000000-0000-0000-0000-0000000000a0',
        '00000000-0000-0000-0000-0000000000c0',
        '00000000-0000-0000-0000-0000000000b0', 'nivel::a1', 'Nivel::A1');

insert into public.concept_tags (concept_id, tag_id, owner_id)
values ('00000000-0000-0000-0000-0000000000e0',
        '00000000-0000-0000-0000-0000000000a0',
        '00000000-0000-0000-0000-0000000000b0');

insert into public.practice_items (id, concept_id, owner_id, mode, prompt_text, answer_text, config)
values ('00000000-0000-0000-0000-0000000000f1',
        '00000000-0000-0000-0000-0000000000e0',
        '00000000-0000-0000-0000-0000000000b0', 'basic_recognition',
        'enunciado', 'respuesta', '{"mode":"basic_recognition"}'::jsonb);
insert into public.practice_items (id, concept_id, owner_id, mode, prompt_text, answer_text, config)
values ('00000000-0000-0000-0000-0000000000f2',
        '00000000-0000-0000-0000-0000000000e0',
        '00000000-0000-0000-0000-0000000000b0', 'cloze',
        'La ___ es azul', 'casa', '{"mode":"cloze","answers":["casa"]}'::jsonb);

-- --- Estructura: quién tiene archived_at y quién no ----------------------

select has_column('public', 'decks',          'archived_at', 'decks archiva');
select has_column('public', 'concepts',       'archived_at', 'concepts archiva');
select has_column('public', 'practice_items', 'archived_at', 'practice_items archiva');
select hasnt_column('public', 'tags', 'archived_at',
  'tags no archiva: se borra de verdad (LEX-3.4/3.6, sin historial)');

-- --- Archivar un mazo no toca su concepto ni el enlace --------------------

select lives_ok(
  $$ update public.decks set archived_at = now()
      where id = '00000000-0000-0000-0000-0000000000d0' $$,
  'archivar un mazo no falla'
);
select is(
  (select archived_at is not null from public.decks
    where id = '00000000-0000-0000-0000-0000000000d0'),
  true, 'el mazo queda archivado'
);
select is(
  (select archived_at from public.concepts
    where id = '00000000-0000-0000-0000-0000000000e0'),
  null, 'archivar el mazo no archiva su concepto (sin cascada)'
);
select isnt_empty(
  $$ select 1 from public.deck_concepts
      where deck_id = '00000000-0000-0000-0000-0000000000d0'
        and concept_id = '00000000-0000-0000-0000-0000000000e0' $$,
  'el enlace mazo-concepto sigue ahí: archivar no destruye referencias'
);

-- --- Restaurar el mazo: sin pasos adicionales ------------------------------

select lives_ok(
  $$ update public.decks set archived_at = null
      where id = '00000000-0000-0000-0000-0000000000d0' $$,
  'restaurar un mazo no falla'
);
select is(
  (select archived_at from public.decks
    where id = '00000000-0000-0000-0000-0000000000d0'),
  null, 'el mazo queda restaurado'
);
select isnt_empty(
  $$ select 1 from public.deck_concepts
      where deck_id = '00000000-0000-0000-0000-0000000000d0'
        and concept_id = '00000000-0000-0000-0000-0000000000e0' $$,
  'el enlace mazo-concepto no necesitó recrearse: nunca se tocó'
);

-- --- Archivar el concepto no toca el mazo, sus enlaces ni sus ítems -------

select lives_ok(
  $$ update public.concepts set archived_at = now()
      where id = '00000000-0000-0000-0000-0000000000e0' $$,
  'archivar un concepto no falla'
);
select is(
  (select archived_at from public.decks
    where id = '00000000-0000-0000-0000-0000000000d0'),
  null, 'archivar el concepto no archiva el mazo que lo contiene'
);
select isnt_empty(
  $$ select 1 from public.deck_concepts
      where concept_id = '00000000-0000-0000-0000-0000000000e0' $$,
  'el enlace mazo-concepto sigue ahí tras archivar el concepto'
);
select isnt_empty(
  $$ select 1 from public.concept_tags
      where concept_id = '00000000-0000-0000-0000-0000000000e0' $$,
  'el enlace concepto-etiqueta sigue ahí tras archivar el concepto'
);
select is(
  (select count(*)::int from public.practice_items
    where concept_id = '00000000-0000-0000-0000-0000000000e0'),
  2, 'los dos ítems del concepto siguen existiendo tras archivarlo'
);
select is(
  (select bool_or(archived_at is not null) from public.practice_items
    where concept_id = '00000000-0000-0000-0000-0000000000e0'),
  false,
  'archivar el concepto no archiva sus ítems de práctica (Q-006, opción 1: sin cascada)'
);

-- --- Restaurar el concepto: enlaces e ítems intactos, sin recrear nada ---

select lives_ok(
  $$ update public.concepts set archived_at = null
      where id = '00000000-0000-0000-0000-0000000000e0' $$,
  'restaurar un concepto no falla'
);
select is(
  (select count(*)::int from public.practice_items
    where concept_id = '00000000-0000-0000-0000-0000000000e0'),
  2, 'los ítems del concepto restaurado siguen siendo los mismos dos'
);

-- --- Archivar un ítem no toca su concepto ni al otro ítem -----------------

select lives_ok(
  $$ update public.practice_items set archived_at = now()
      where id = '00000000-0000-0000-0000-0000000000f1' $$,
  'archivar un ítem de práctica no falla'
);
select is(
  (select archived_at from public.concepts
    where id = '00000000-0000-0000-0000-0000000000e0'),
  null, 'archivar un ítem no archiva su concepto'
);
select is(
  (select archived_at from public.practice_items
    where id = '00000000-0000-0000-0000-0000000000f2'),
  null, 'archivar un ítem no archiva al otro ítem del mismo concepto'
);

-- --- Idempotencia: archivar/restaurar dos veces seguidas no falla --------

select lives_ok(
  $$ update public.practice_items set archived_at = now()
      where id = '00000000-0000-0000-0000-0000000000f1' $$,
  'archivar un ítem ya archivado no falla (idempotente en el resultado: sigue archivado)'
);
select lives_ok(
  $$ update public.decks set archived_at = null
      where id = '00000000-0000-0000-0000-0000000000d0' $$,
  'restaurar un mazo ya restaurado no falla (no-op seguro)'
);

-- --- Contraste: borrar (no archivar) una etiqueta sí cascada sus enlaces -

select lives_ok(
  $$ delete from public.tags where id = '00000000-0000-0000-0000-0000000000a0' $$,
  'borrar una etiqueta no falla'
);
select is_empty(
  $$ select 1 from public.concept_tags
      where tag_id = '00000000-0000-0000-0000-0000000000a0' $$,
  'borrar la etiqueta sí borra en cascada su enlace concept_tags — al contrario que archivar'
);

select * from finish();
rollback;
