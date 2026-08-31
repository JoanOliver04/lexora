-- LEX-2.9 — Curso activo del usuario.
--
-- `MASTER_SPEC.md` §9.12 lista «curso activo» entre los ajustes, y §192 dice
-- que la interfaz inicial «priorizará uno activo». En la V1 el onboarding crea
-- un único curso, así que hoy no hay entre qué elegir; esta migración pone la
-- persistencia y la garantía de aislamiento para cuando la haya, y el shell
-- (LEX-2.9) la usa para saber qué curso mostrar.
--
-- **La propiedad es estructural, no una comprobación en la lectura.** `courses`
-- ya trae `constraint courses_id_owner_unique unique (id, owner_id)` (LEX-2.1),
-- puesto para que `course_settings` pudiera referenciar `(course_id, user_id)`.
-- El mismo truco vale aquí: la PK de `profiles` es `id`, así que una FK
-- compuesta `(active_course_id, id) -> courses (id, owner_id)` hace que
-- «tu curso activo es un curso tuyo» sea imposible de violar —un `update` que
-- apunte al curso de otro falla con `23503`, no «devuelve vacío al leer»—.
--
-- `on delete set null (active_course_id)`: si el curso desaparece (borrado de
-- cuenta en cascada, o retirada de curso en una fase posterior), el puntero se
-- limpia solo en vez de bloquear el borrado. **La lista de columnas es
-- obligatoria** en una FK de varias columnas: `on delete set null` a secas
-- pondría a NULL *todas* las columnas de la FK, incluida `id` —la PK—, y el
-- borrado fallaría. Sintaxis de PostgreSQL 15+; aquí corre 17.

alter table public.profiles
  add column active_course_id uuid;

alter table public.profiles
  add constraint profiles_active_course_fk
    foreign key (active_course_id, id)
    references public.courses (id, owner_id)
    on delete set null (active_course_id);

comment on column public.profiles.active_course_id is
  'LEX-2.9. Curso que la interfaz prioriza. FK compuesta con `id`: solo puede '
  'apuntar a un curso del propio usuario. NULL = usar el curso más antiguo.';

-- Las políticas RLS de `profiles` (LEX-2.3) ya cubren esta columna: es
-- `profiles_update_own` (`auth.uid() = id`, USING y WITH CHECK) la que permite
-- al usuario fijar su curso activo y a nadie más el suyo. No hace falta
-- política nueva.

-- ---------------------------------------------------------------------------
-- `complete_onboarding` fija el curso activo al provisionar.
--
-- Se reemplaza la función de LEX-2.7 para añadir una línea: tras crear o
-- actualizar el curso, `profiles.active_course_id` pasa a apuntarlo si estaba
-- en NULL (`coalesce`), de modo que un usuario nuevo sale del onboarding con un
-- curso activo y el shell no necesita adivinar. Una repetición no pisa una
-- elección posterior del usuario.
--
-- El resto del cuerpo es idéntico a `20260831204649_onboarding_rpc.sql`.
-- ---------------------------------------------------------------------------

create or replace function public.complete_onboarding(
  p_ui_locale       public.ui_locale,
  p_declared_level  public.cefr_level,
  p_start_level     public.cefr_level,
  p_daily_new_limit integer
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_source_id uuid;
  v_target_id uuid;
  v_course_id uuid;
begin
  if v_uid is null then
    raise exception 'complete_onboarding requires an authenticated session'
      using errcode = '28000';
  end if;

  select id into v_source_id
    from public.languages where code = 'es' and locale = 'es';
  select id into v_target_id
    from public.languages where code = 'en' and locale = 'en';

  if v_source_id is null or v_target_id is null then
    raise exception 'language catalogue is missing the reference pair (es/es, en/en)'
      using errcode = 'P0002';
  end if;

  select id into v_course_id
    from public.courses
    where owner_id = v_uid
    order by created_at asc, id asc
    limit 1;

  if v_course_id is null then
    insert into public.courses (
      owner_id, title,
      source_language_id, target_language_id, target_locale,
      declared_level, start_level
    )
    values (
      v_uid,
      case p_ui_locale when 'en' then 'English' else 'Inglés' end,
      v_source_id, v_target_id, 'en-GB',
      p_declared_level, p_start_level
    )
    returning id into v_course_id;
  else
    update public.courses
      set source_language_id = v_source_id,
          target_language_id = v_target_id,
          target_locale      = 'en-GB',
          declared_level     = p_declared_level,
          start_level        = p_start_level,
          active             = true
      where id = v_course_id;
  end if;

  insert into public.course_settings (course_id, user_id, daily_new_limit)
  values (v_course_id, v_uid, p_daily_new_limit)
  on conflict (course_id) do update
    set daily_new_limit = excluded.daily_new_limit;

  update public.profiles
    set ui_locale = p_ui_locale,
        onboarding_completed_at = coalesce(public.profiles.onboarding_completed_at, now()),
        active_course_id = coalesce(public.profiles.active_course_id, v_course_id)
    where id = v_uid;

  return v_course_id;
end;
$$;
