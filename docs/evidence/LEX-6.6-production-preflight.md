# LEX-6.6 — Preflight del primer despliegue

**Fecha:** 2026-10-11.
**Rama / base:** `fix/lex-6-6-production-catalogue` / `58da082`.
**Alcance autorizado:** comprobaciones, preparar el catálogo, enlazar el proyecto
verificado y ejecutar dry-run. Ampliado por Joan a la corrección mínima de la
sonda y sus pruebas. Posteriormente, autorización expresa para aplicar las
14 migraciones revisadas y desactivar temporalmente Preview. **No** seed local,
reset remoto, cambios de plan ni compartir producción con Preview.
LEX-6.7 no iniciada. Q-007 sigue abierta.

Publicación del código autorizada: [PR #98](https://github.com/JoanOliver04/lexora/pull/98),
producto `ed9163e`. La integración requiere los tres checks de la revisión final;
el estado de la entrega y sus ejecuciones se consulta en ese PR. Publicar el SQL
no lo aplica al proyecto remoto. La aplicación real autorizada y su evidencia
posterior se registran al final; las observaciones iniciales se conservan como
historial del preflight.

## Estado observado antes de la aplicación

- Vercel: último redeploy Ready, Production, fuente `main` / `58da082`.
- Variables públicas necesarias presentes con alcance Production. Site URL
  coincide con el origen público; no existe SKIP_ENV_VALIDATION en el proyecto.
  Los valores sensibles gestionados por la integración no se han revelado.
  No se certifican sus literales ni el snapshot interno del build.
- Supabase Auth: Site URL del sitio y cuatro callbacks ES/EN configurados.
- CLI fijada en el repositorio: autenticada, destino verificado por ID, nombre,
  región europea y estado ACTIVE_HEALTHY. Link correcto; archivos fuera de Git.
- Historial remoto vacío antes del dry-run y en la lectura posterior a la
  corrección: las 14 migraciones siguen pendientes.
- Protección de `main` verificada mediante la API de GitHub: PR requerido,
  cero aprobaciones obligatorias, tres checks vinculados a GitHub Actions,
  `strict: true`, conversaciones resueltas y administradores incluidos.
  Force push, borrado, bloqueo e historial lineal desactivados. Ningún ajuste
  de protección modificado por el agente.
- CI del código ya fusionado: run `37613287678`, tres trabajos SUCCESS. Eso no
  certifica la preparación publicada después mediante PR #98; se exigen sus
  propios checks y los de `main` tras integrar.

## Hallazgo del health

El endpoint público devuelve HTTP 503 con `app: true`, `database: false`.
La sonda del código pide la raíz REST usando solo la clave pública. Una consulta
directa al proyecto verificado con una clave publishable válida reproduce:

```text
GET raíz REST                     401: Secret API key required
GET configuración pública Auth    200
GET languages, select=code, limit=0 404: PGRST205 (tabla todavía ausente)
```

El rechazo de la raíz REST explica un mecanismo de fallo de la sonda aun con
una clave pública válida. No se afirma haber comparado el literal sensible de
Vercel con el de la CLI. Aplicar el esquema no corrige ese rechazo. No usar una
clave privilegiada ni aceptar 401 como «base sana».

## Corrección mínima autorizada de la sonda

El adaptador consulta `languages?select=id&limit=0` con `apikey` pública y
`Accept: application/json`, sin sesión ni escrituras. Solo acepta un HTTP exitoso
con JSON `[]`; un 401, 403, 404, error de red, JSON inesperado o timeout devuelve
false. Conserva `no-store` y el límite de 3 segundos, también durante la lectura
del cuerpo. Contrato HTTP público intacto: 200/503 y tres campos genéricos, sin
hosts, errores de proveedor o datos de usuario. No se cambia ruta, composición,
dominio, esquema ni variables, y no se añade clave privilegiada.

Verificación de la corrección:

```text
pnpm test <adaptador de sonda> <caso de uso de health>
  exit 0: 2 archivos / 19 tests PASS (16 regresiones del adaptador + 3 existentes)
pnpm check
  exit 0: 75 archivos / 539 tests PASS; 2 archivos / 11 tests omitidos
  formato, lint, tipos, contraste 18/18 y build correctos
CI=1 pnpm e2e tests/e2e/landing.spec.ts --grep <health> --workers=1
  exit 0: 2 PASS, API contra build real y base local existente
  HTTP 200; status=ok, app=true, database=true; no-store; sin detalles internos
```

El smoke E2E no reutiliza un servidor anterior y no arranca, resetea o siembra
Supabase. No se ha ejecutado el seed local. Comprobación remota de solo lectura
con clave pública y el mismo endpoint/headers de la sonda:

```text
HTTP 404; PGRST205; databaseReachable=false; recordsReturned=0
```

Es el resultado correcto mientras falta `languages`: no se declara producción
sana sin esquema. Es una petición directa que reproduce el contrato, no un
despliegue del adaptador nuevo. La corrección se publica en PR #98; la observación
remota de esta sección precede a esa entrega. Las 14 migraciones no se aplican
al publicar el código y necesitan autorización expresa independiente.

## Migración preparada

`20261011120000_language_catalogue.sql` añade solo los pares `es/es`, `en/en`
y `en/en-GB`, con claves de traducción públicas. `ON CONFLICT (code, locale)
DO NOTHING` conserva todos los campos de una fila previa, incluido un UUID
distinto, un nombre personalizado o un idioma inactivo. Una colisión de PK con
otro par falla de forma atómica; no se sobrescribe el catálogo.

No crea usuarios, cursos, tarjetas o material de estudio. No cambia esquema,
políticas, RPC ni versiones del scheduler. No ejecuta `seed.sql`.
Compatibilidad: lectores actuales resuelven idiomas por clave natural; se
reutilizan UUID locales al insertar filas faltantes. Reintento seguro.

**Rollback:** si hay un problema de despliegue, detener tráfico o volver al
código anterior conservando el catálogo. No eliminar filas potencialmente
referenciadas por cursos. Toda corrección posterior debe ser otra migración
revisada; ningún rollback destructivo está autorizado.

## Verificación local sin seed

`pnpm db:test:catalogue` ejecuta los **14 archivos SQL reales**, en orden, en una
base nueva y aleatoria dentro del contenedor PostgreSQL local. Nunca usa el link
remoto ni lee `seed.sql`. Usa una superficie Auth mínima de prueba (`users.id`,
`auth.uid()` y roles locales), no una reproducción ni una aceptación de Auth
alojado. El contexto gestionado completo sigue cubierto por la suite existente.

Resultado real: **exit 0, 15 aserciones PASS**. Catálogo completo sin seed,
ausencia de datos de usuario, replay sin cambios de timestamps, preservación de
UUID/metadatos existentes, catálogo parcial, idioma ajeno, colisión de PK
atómica, RLS, lectura/escritura anon y authenticated, y onboarding con los
idiomas de referencia. La base desechable se elimina al finalizar; la base local
habitual permanece intacta. El comando se añade al trabajo de base de datos de CI.

`pnpm check`: **exit 0**; formato, lint, tipos, contraste 18/18, tests
**74 archivos / 523 tests PASS; 2 archivos / 11 tests omitidos**, build correcto.
Los 10 de integración requieren su gate de base local y el caso privado sigue
omitido. Este es el gate de la preparación inicial; el gate y smoke posteriores
a la corrección de la sonda se registran en su sección anterior.

`pnpm db:types` desde la base **local**: exit 0, tipos generados sin diff. La
migración nueva es solo de datos y no altera el esquema. Formato y
`git diff --check` pasan después de actualizar documentación.

## Resultado remoto: solo simulación

```text
pnpm exec supabase link --project-ref <destino verificado>     exit 0
pnpm exec supabase migration list --linked                    exit 0; remoto vacío
pnpm exec supabase db push --linked --dry-run --skip-vault     exit 0
DRY RUN: migrations will *not* be pushed to the database.
dryRun: true; upToDate: false; seeds: []; roles: []
```

Orden exacto propuesto:

```text
20260828143434_identity_and_course.sql
20260831162304_identity_and_course_rls.sql
20260831204649_onboarding_rpc.sql
20260831215553_active_course.sql
20260902193649_library_schema.sql
20260904122347_library_rls.sql
20260905180000_import_jobs.sql
20260910120000_import_error_codes_validation.sql
20260910160000_import_error_code_rejected.sql
20260911120000_study_schema.sql
20260911150000_study_rls.sql
20260911180000_commit_review.sql
20260911190000_commit_review_idempotency.sql
20261011120000_language_catalogue.sql
```

Un dry-run enumera pendientes; no demuestra que el proyecto remoto haya aplicado
SQL o que las tablas, grants, RLS, RPC y Auth estén aceptados. La aplicación real
y las comprobaciones posteriores requieren autorización expresa. No se ejecuta
el seed local ni se reinicia la base remota.

## Aplicación autorizada y verificación remota

Joan aprueba expresamente las 14 migraciones el 2026-10-11. Destino y link
revalidados; historial todavía vacío y archivos SQL intactos respecto a la
revisión con CI verde `50d4a74`. Dry-run repetido: exactamente el mismo orden,
sin seeds ni roles. [CI `38145356216`](https://github.com/JoanOliver04/lexora/actions/runs/38145356216):
Calidad, Base de datos y Extremo a extremo SUCCESS. pgTAP 17/477, catálogo
15 aserciones, integración 10 tests, E2E 108 PASS + 4 casos privados omitidos.

```text
supabase db push --linked --skip-vault --yes     exit 0; 14 migraciones aplicadas
dryRun: false; seeds: []; roles: []
supabase migration list --linked                exit 0; 14 pares local/remoto coinciden
supabase db push --linked --dry-run --skip-vault exit 0; upToDate: true; migrations: []
```

Verificación posterior, sin escrituras de prueba:

- Sonda pública exacta: HTTP 200, JSON `[]`, cero registros descargados.
- Catálogo público: tres pares activos `es/es`, `en/en` y `en/en-GB`.
- Metadatos SQL: las 15 tablas públicas llevan RLS y políticas explícitas.
  Las RPC `complete_onboarding` y `commit_review` son SECURITY INVOKER;
  anon no tiene EXECUTE y authenticated sí. No se ejecutaron las RPC.
- Lecturas REST anónimas de las 14 tablas privadas: HTTP 200 y cero filas
  visibles. Los recuentos comprobados de aplicación son cero: no se crearon
  perfiles, cursos, mazos, conceptos, ítems, sesiones, memoria ni logs.
- Una primera consulta de metadatos usó una firma RPC incorrecta y recibió
  42883; corregida consultando `pg_proc` por OID. Ambas consultas de solo lectura.

Esto verifica esquema, catálogo y permisos, pero las tablas vacías no prueban
aislamiento entre dos cuentas reales. La suite local/CI cubre dueño/no-dueño;
onboarding y correo reales requieren una cuenta del propietario.

## Preview y siguiente comprobación

Vercel Preview de `50d4a74` falló al validar las dos variables públicas de
Supabase ausentes. Es coherente con la integración exclusiva para Production,
no un motivo para compartir la base real ni saltarse la validación.
Joan autoriza desactivar temporalmente despliegues automáticos fuera de `main`.
`vercel.json` usa `git.deploymentEnabled` con `**: false` y `main: true`;
la regla positiva mantiene Production según la
[configuración oficial de Vercel](https://vercel.com/docs/project-configuration/git-configuration).
Los tres checks de GitHub Actions y la protección de `main` siguen intactos.
Decisión Q-008; no hay dependencia ni ADR nuevo.

Integrar la nueva revisión de PR #98 solo con sus tres checks verdes y verificar
CI de `main`, estado Ready de Production y health HTTP 200 del nuevo código.
El onboarding, confirmación de correo y prueba física del propietario quedan
como aceptación manual pendiente. Ningún seed ni reset. LEX-6.7 sin iniciar.
