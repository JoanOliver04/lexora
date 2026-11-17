# LEX-16.1 — Niveles admitidos hasta C1

Fecha: 2026-11-17. Versión preparada: 1.2.0. Base: `bd0709a` (1.1.0).
Solicitud del propietario: añadir C1 conservando los niveles anteriores.

El vocabulario pasa a A1/A2/B1/B2/C1 en onboarding, mazos, conceptos y filtros.
C2 sigue rechazado. C1 es una clasificación opcional para la biblioteca y una
selección inicial; no se añade un currículo precargado ni certificación.
No se cambia FSRS, el acceso personal cerrado ni los registros existentes.

## Migración

`20261117161352_add_c1_level.sql` amplía `public.cefr_level` con `IF NOT EXISTS`
y timeout de bloqueo de5s. Se aplicó primero a la base y después se publicará
la aplicación. El nuevo valor solo se utiliza después del commit de la DDL.

Producción: enum inspeccionado antes A1/A2/B1/B2 y después A1/A2/B1/B2/C1;
historial remoto25 migraciones, versión20261117161352. No se modificaron filas,
RLS ni permisos. La marca de tiempo automática del proveedor se alineó con el
archivo y con el historial local mediante `migration repair --local`; no se
reinició ni sembró ninguna base existente. Tipos generados desde la base local.

La expansión admite la aplicación anterior. Tras guardar datos C1 se conserva
el enum y se corrige hacia delante, sin borrar ni rebajar registros para rollback.
Decisión y alcance: [ADR-012](../adrs/012-c1-level.md).

## Evidencia local

- Rojo inicial:3 casos C1 fallaron antes del cambio;31 casos existentes pasaron.
- Dominios tras el cambio:41 PASS, incluidos C1 válido y C2 inválido.
- `supabase test db supabase/tests/database/270-c1-level.sql`:11 PASS.
- `pnpm db:test`:603 PASS en26 archivos; transacciones sintéticas revertidas.
- `pnpm e2e tests/e2e/c1-level.spec.ts --workers=1 --retries=0`:4 PASS.
  ES/EN y escritorio Chromium/móvil Poco F5: selección inicial C1 persistida,
  creación de mazos/conceptos C1 y B2, filtros que los distinguen y relectura
  desde formularios. Incluye Axe, teclado, temas y ampliación de texto del
  helper compartido. Las cuentas son sintéticas y solo del backend local.

Los16 análisis Axe quedaron sin infracciones ni incompletos. La captura de
reflow320/texto200% se revisó visualmente; no acredita zoom o lector físicos.

Gate general inicial `LEXORA_DB_TESTS=1 pnpm check`:965 PASS+1 omisión privada;
Nodebackup12 PASS, formato/lint/tipos/28 contrastes/build PASS. La generación
independiente de tipos coincide. Gitleaks8.30.1:698 archivos públicos, sin fugas;
se excluyeron archivos ignorados, credenciales y backups del snapshot.

## Revisión y corrección

Tres lentes independientes (corrección, seguridad y estándares) revisaron el
snapshot de21 archivos. Corrección encontró un P2 real: `by_level.max(5)` no
admitía A1/A2/B1/B2/C1 más `unassigned`. Se reprodujo contra la RPC local real:
1 FAIL (`Invalid statistics response`)+7 PASS. El máximo pasa a derivarse de
`CEFR_LEVELS.length + 1`. La regresión exige los seis grupos y sus recuentos;
después8 PASS. La lente de corrección revisó el delta de dos archivos y cerró
el hallazgo. Seguridad y estándares no detectaron otros hallazgos accionables.
Los revisores no ejecutaron suites ni consultaron producción.

Gate general repetido tras esta corrección: `LEXORA_DB_TESTS=1 pnpm check`
exit0;966 PASS+1 omisión privada en128 archivos, Nodebackup12 PASS,
formato/lint/tipos/28 contrastes/build PASS.
La publicación exige los tres checks protegidos del head exacto. La PR conserva
sus ejecuciones, resultado de recuperación aislada y despliegue Production.
