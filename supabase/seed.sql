-- Datos semilla del entorno local (y de CI: `db:reset` los aplica en el job de
-- base de datos). Nunca se aplican a preview ni a producción.
--
-- Reglas (MASTER_SPEC §15.3, docs/CONTENT_POLICY.md):
--   · Deterministas. Los identificadores son literales fijos, no `gen_random_uuid()`:
--     dos ejecuciones deben dejar exactamente la misma base.
--   · Idempotentes. `on conflict do nothing`: volver a ejecutar el seed no cambia
--     nada. Si un `name_key` tuviera que cambiar, eso es una migración, no una
--     reescritura del seed.
--   · Sin datos personales, ni reales ni verosímiles. Sin material privado.

-- ---------------------------------------------------------------------------
-- Catálogo de idiomas (LEX-2.2).
--
-- Tres filas para el par inicial. Los cuatro conceptos de idioma se mantienen
-- separados: el idioma de interfaz es `profiles.ui_locale` (un enum), no una
-- fila de esta tabla. Aquí solo viven el idioma de apoyo, el idioma estudiado y
-- su variante regional:
--
--   es / es      español, idioma de apoyo
--   en / en      inglés, idioma estudiado (base)
--   en / en-GB   inglés británico, variante del contenido
-- ---------------------------------------------------------------------------

insert into public.languages (id, code, locale, name_key, active) values
  ('5eeda001-0000-4000-8000-000000000001', 'es', 'es',    'language.es',    true),
  ('5eeda001-0000-4000-8000-000000000002', 'en', 'en',    'language.en',    true),
  ('5eeda001-0000-4000-8000-000000000003', 'en', 'en-GB', 'language.en_gb', true)
on conflict (code, locale) do nothing;

-- ---------------------------------------------------------------------------
-- Curso de referencia.
--
-- No se siembra una fila en `courses`: un curso tiene `owner_id NOT NULL` y lo
-- crea el onboarding por usuario (LEX-2.7); sembrarlo obligaría a inventar un
-- usuario en `auth.users`, lo que adelantaría la decisión de LEX-2.4.
--
-- «Curso de referencia» es, por tanto, esta definición, que el onboarding y la
-- demo usan como fuente única:
--
--   source_language_id  → el id de la fila es / es
--   target_language_id  → el id de la fila en / en
--   target_locale       → 'en-GB'
--   declared_level      → lo elige la persona en el onboarding (A1–B2)
--   start_level         → 'A1' recomendado (repaso acelerado)
--   daily_new_limit     → 5 (por defecto en course_settings)
-- ---------------------------------------------------------------------------
