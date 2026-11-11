# Desgloses estadísticos y reintento de estudio

Fecha: 2026-11-11. Base: publicación del PR #100, merge `0f823fe`.
Rama: `feat/v1-statistics-breakdowns`. Continuación y despliegues autorizados.

## Implementación

La migración `20261111134401_statistics_breakdowns.sql` sustituye la RPC con la
misma firma y permisos INVOKER. Añade agregados por tipo de concepto y nivel;
conserva todos los campos anteriores y sus significados. Los clientes anteriores
ignoran los campos nuevos. No hay cambios ni borrado de registros históricos.

Los paneles ES/EN usan detalles nativos y muestran eventos del periodo y estados
actuales separados. Una categoría con repasos antiguos conserva su actividad
aunque sus tarjetas estén archivadas. La clasificación del contenido es actual
y se explica así; no se presenta como nivel de dominio del usuario.

Se añade una prueba real de concepto en dos mazos y reclasificación a B1/gramática:
el total permanece en 1.044 eventos y una tarjeta Review. Archivar conserva los
1.044 eventos del grupo y deja a cero sus estados actuales. RLS A/B/anon se mantiene.

El gate previo detectó un reintento de reveal ignorado: la guarda se liberaba
en un efecto pasivo posterior al render que ya habilitaba el botón. Se sincronizan
ambas guardas de envío con el commit de interfaz mediante layout effects. Se
conserva la aserción original y se exige además un tercer intento con los mismos
IDs. No se suben timeouts, se omiten pruebas ni se añaden reintentos al gate.

Playwright admite puerto configurable, inyecta ese origen en el build y las
pruebas de API usan el origen del fixture. El servidor siempre es propio; se usa
3100 en esta máquina para conservar el preview concurrente de Planora en 3000.
El control CSRF de producción mantiene su origen configurado; no se relaja.

## Verificación

- `LEXORA_DB_TESTS=1 pnpm check`: PASS, 762 pruebas + 1 omitida, tipos, lint,
  contraste y build Next.js 16.4.6.
- `pnpm db:test`: 19 archivos / 497 aserciones PASS.
- `pnpm db:test:catalogue`: 18 migraciones reales desde cero, 15 aserciones PASS,
  sin seed; base desechable eliminada.
- `CI=1 LEXORA_E2E_PORT=3100 pnpm e2e --workers=2 --retries=0`: 130 PASS,
  4 omitidas preexistentes, exit 0. No se reutiliza ningún servidor ajeno.

## Producción anterior verificada

PR #100 integrado con tres checks SUCCESS. Las tres migraciones de ese snapshot
se aplicaron en el proyecto verificado, con dry-run posterior sin pendientes.
El despliegue de Vercel 7711900277 corresponde al merge `0f823fe` y figura SUCCESS.
Con el dominio público comunicado por Joan, `/en` y `/api/health` devuelven 200;
health contiene `status: ok`, `app: true`, `database: true`. La URL técnica
protegida no se usó como prueba de salud. No hubo seed, reset o borrado de datos.

Este documento no certifica lector de pantalla ni teléfono físicos. Q-009
conserva sus comprobaciones específicas pendientes. El plan no ha cambiado y
las operaciones de producción no han creado costes nuevos.
