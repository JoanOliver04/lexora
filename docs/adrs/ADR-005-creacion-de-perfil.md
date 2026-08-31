# ADR-005 — La creación del perfil es un caso de uso, no un trigger

**Estado:** Aceptado
**Fecha:** 2026-08-31
**Decide:** propietario del proyecto

## Contexto

El alta en Supabase Auth crea una fila en `auth.users`. La aplicación necesita
una fila propia en `public.profiles` (relación uno a uno) para colgar de ella el
idioma de interfaz, la zona horaria y el fin del onboarding. `MASTER_SPEC.md`
§9.2 lo pide así: «Creación automática e idempotente del perfil de aplicación
asociado a `auth.users`.»

Hay dos formas de conseguirlo:

1. Un **trigger** `AFTER INSERT ON auth.users` que ejecuta una función
   `SECURITY DEFINER` la cual inserta en `public.profiles`. Es el patrón que
   Supabase muestra por defecto (`handle_new_user`).
2. Un **caso de uso** de la capa de aplicación que asegura la fila a la entrada
   del área autenticada, bajo la identidad del propio usuario.

Cuando LEX-2.4 empieza ya existen dos garantías de base de datos relevantes: la
clave primaria de `profiles` (LEX-2.1) y la política RLS `profiles_insert_own`
—`WITH CHECK (auth.uid() = id)`— (LEX-2.3). `MASTER_SPEC.md` (línea 1093) sienta
además el precedente de que esta clase de elección —RLS como usuario autenticado
frente a un adaptador de servidor con privilegios— se decide en un ADR, no por
omisión.

## Decisión

**Caso de uso `ensureProfile`, sin trigger y sin migración nueva.**

- Puerto `ProfileRepository.ensureExists(userId)` en
  `src/modules/identity/application/`, con un caso de uso `ensureProfile` que
  valida el identificador y delega.
- Adaptador Supabase en `src/modules/identity/infrastructure/`: `upsert` con
  `ignoreDuplicates`, que PostgREST traduce a
  `INSERT ... ON CONFLICT (id) DO NOTHING`. `select()` devuelve la fila si la
  inserta y vacío si ya existía → resultado `created` / `already-existed`.
- Cableado en `src/composition/identity.ts`:
  `ensureProfileForCurrentUser()` deriva el `userId` de `getClaims()` —firma
  verificada—, nunca de un parámetro (MASTER_SPEC §16.1).
- La fila se inserta **bajo la identidad del propio usuario**, así que la
  política `profiles_insert_own` actúa de segunda barrera: el caso de uso no
  puede crear el perfil de otra persona.
- La unicidad la garantiza la clave primaria de `profiles`, no la cláusula
  `ON CONFLICT`; la cláusula solo hace que el reintento no sea un error.

LEX-2.4 entrega el mecanismo y su prueba. La invocación desde una ruta llega en
LEX-2.6 (protección de rutas), que llamará a `ensureProfileForCurrentUser()` a la
entrada del área autenticada. Hoy no existe esa área, así que nada depende
todavía del perfil.

## Alternativas consideradas

**Trigger `SECURITY DEFINER` sobre `auth.users`.**
Descartada para la V1.

- Añade una función `SECURITY DEFINER` —salta RLS por diseño—, y `ROADMAP.md`
  §3.6 marca «políticas RLS y funciones `security definer`» como área que debe
  recibir revisión cruzada independiente antes de cerrar su hito. Esa revisión
  no está disponible ahora; meter la función sin ella es crear deuda de
  seguridad no revisada.
- Pone la lógica de arranque de identidad en SQL, donde no se puede probar junto
  con el resto del módulo `identity` con un repositorio en memoria.
- Acopla a detalles internos del esquema `auth`, que es de Supabase y puede
  cambiar entre versiones.
- Lo que aportaría —cubrir caminos de creación de usuario que no pasan por
  nuestro servidor: alta por API de administración, o Google OAuth en una
  versión futura— no hace falta en la V1, cuyo único alta es correo y contraseña
  a través de nuestras propias pantallas.

**Híbrido: trigger *y* caso de uso.**
Descartada. Duplica la superficie —dos sitios que crean la fila, dos cosas que
mantener y revisar— sin beneficio para la V1.

**Insert directo desde la Server Action de registro, sin puerto.**
Descartada. Filtra el cliente de base de datos a la presentación (contra ADR-001)
y no se puede reintentar desde otro punto de entrada si el alta falla después de
crear el usuario pero antes de crear el perfil.

## Consecuencias

**A favor:**

- El arranque de identidad se prueba sin base de datos, con el resto de la capa
  de aplicación.
- Ninguna función `SECURITY DEFINER` nueva; nada que revisar en esa categoría.
- La política RLS de inserción hace de segunda barrera comprobada.
- Cero cambio de esquema: LEX-2.4 no añade migración.

**En contra, y aceptado:**

- Hay una ventana entre la creación de la fila en `auth.users` y la primera
  petición de servidor que pasa por nuestro código, durante la cual el perfil no
  existe. En la V1 **todos** los caminos que llevan a contenido autenticado
  pasan por servidor propio: en local `enable_confirmations = false`, así que
  `signUp()` devuelve sesión y la siguiente petición asegura el perfil; en
  preview/producción el enlace de confirmación redirige a una ruta nuestra. La
  garantía «ninguna página autenticada se renderiza sin perfil» la cierra
  LEX-2.6 al llamar a `ensureProfileForCurrentUser()` a la entrada del área
  autenticada.
- Si en el futuro un camino puede alcanzar contenido sin pasar por ese punto de
  entrada —usuarios creados por un administrador, Google OAuth—, habrá que
  revisarlo, y quizá entonces sí añadir el trigger.

## Cómo se verifica

- `src/modules/identity/application/ensure-profile.test.ts`: crea a la primera;
  es idempotente al repetir; dos llamadas concurrentes dejan una sola fila;
  rechaza un identificador vacío; propaga el fallo del repositorio como
  `EnsureProfileError`.
- `supabase/tests/database/050-profile-creation.sql`: como `authenticated` con
  `auth.uid()` fijado — el primer `ensure` inserta una fila, el segundo es
  no-op, un insert duplicado a pelo lanza `23505` (la PK es lo que hace el
  perfil no duplicable), A no puede crear el perfil de B (`42501`), `anon`
  tampoco.
- `pnpm check` y la regla de capas de ESLint: el adaptador vive en
  `infrastructure/`, el caso de uso y el puerto en `application/` sin importar
  `@supabase/*`.

## Cuándo reabrir esta decisión

- Se añade Google OAuth u otro proveedor cuyo callback pueda no pasar por
  nuestro punto de entrada.
- Se crean usuarios por la API de administración de Supabase.
- La ventana sin perfil provoca un fallo real observado, y no hipotético.

Cualquiera de esos casos exige un ADR nuevo, no un cambio silencioso.
