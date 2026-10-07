# LEX-6.6 — Preview de intervalos

**Fecha:** 2026-10-06
**Rama / base:** `feat/lex-6-6-interval-preview` / `cc98478`
**Estado:** `HECHO`, gates locales y CI del código publicado verdes. Entrega en PR #97;
la revisión final se integra únicamente con sus propios checks verdes. Producción pendiente Q-007.

## Entregado

Intervalos por valoración calculados en el servidor después del reveal autorizado.
Se reutilizan el scheduler del contexto, `V1_SCHEDULER_CONFIG` y un único instante
del `Clock`. Con memoria compatible se usa su estado; sin ella, un estado inicial
hipotético sin escribir. La UI indica aproximación/fuzz y puede ocultar las cifras.
Ese ajuste es local a la tarjeta, no una preferencia de cuenta persistida.

| Archivo | Cambio |
|---|---|
| `src/modules/study/application/rating-interval-preview.ts` | Consulta de estado y preview tipado sin writes ni dependencia de React/ts-fsrs. |
| `src/app/[locale]/(app)/app/study/reveal-actions.ts` y `.test.ts` | Preview después de autorizar, mismo instante/config, versión incompatible sin migrar. |
| `study-card-view.tsx` y `.test.tsx` en esa carpeta | Duraciones recibidas, etiquetas aproximadas ES/EN, control mostrar/ocultar. |
| `tests/unit/study/rating-preview-contract.test.ts` | Contrato real New/Learning/Review/Relearning con fuzz y comparación con review. |
| `tests/e2e/study-renderer.spec.ts` | Preview solo tras reveal, ocultar/mostrar y rating intacto; no memoria/logs. |
| `messages/es.json`, `messages/en.json` | Unidades, advertencia y fallback de versión incompatible. |
| `docs/STUDY_OVERVIEW.md`, `ARCHITECTURE.md`, `STATUS.md` | Contrato y límites actuales. |
| `README.md`, `docs/OPEN_QUESTIONS.md` | Estado público actualizado y Q-007 para el destino de producción. |

Roadmap privado local actualizado, no versionado. **Migraciones: 0. Dependencias:
0. ADR nuevos/modificados: 0.** Lean-build mantuvo el cálculo tras el puerto
existente; verify-and-stop limitó la revisión final al árbol que se publicará.

## Evidencia real

```text
pnpm test [contrato de intervalos, acción, UI]
  3 files passed / 25 tests passed, exit 0

LEXORA_DB_TESTS=1 pnpm check
  exit 0: formato, lint, tipos, contraste 18/18, build
  75 files passed + 1 skipped / 533 tests passed + 1 skipped

pnpm db:test
  17 files / 477 assertions, PASS, exit 0

pnpm e2e --workers=2
  108 passed + 4 skipped (casos privados existentes), exit 0
```

El contrato compara el `dueAt` que devuelve preview con el de `scheduler.review`
para las cuatro valoraciones, mismo estado/instante/config v1 con fuzz real. La
memoria leída queda intacta y no se invoca create. Sin estado, Good inicial son
10 minutos; la prueba de navegador verifica esa cifra, control reversible y
rating habilitado al ocultar. Un par de versiones distinto no calcula preview.

Capturas reveladas de escritorio y Poco F5 emulado inspeccionadas, con cifras
aproximadas, advertencia y ajuste. Artefactos sintéticos en `test-results/`,
ignorados. Texto oscuro/200 % y seguridad de contenido conservados. Pruebas
físicas y lector de pantalla físico siguen pendientes; no se declaran completas.

## Revisión del conjunto y publicación

El árbol acumula LEX-6.1…LEX-6.6, todos verificados localmente. Revisados los
filtros de dueño/curso, RLS normal, límites, paginación, rutas, proyección del
frente, replay de sesión y reveal del primer pendiente. No hay SQL, lockfile,
tipos generados ni configuración FSRS modificados. No se publican secretos,
datasets privados o roadmap. El README ya no afirma que no exista producto.

La autorización de Joan del 2026-10-06 incluye publicación y comprobación de
GitHub Actions/producción. El acceso GitHub está validado y `origin/main` sigue
en la base. Los cambios previos no tenían commits: la entrega conjunta se
publicará en una PR de integración del conjunto, con la CI del árbol final;
no se atribuye a snapshots intermedios la verificación local del árbol completo.

Publicados seis commits de implementación (`5e75c8e`, `6867bf8`, `669e077`,
`fbb9251`, `5816003`, `449b877`) en
[PR #97](https://github.com/JoanOliver04/lexora/pull/97). La
[ejecución `37490868423`](https://github.com/JoanOliver04/lexora/actions/runs/37490868423)
del código `449b877f7868ced9410303cca7c4b0dda2ff16ed` terminó con **success** en
Calidad, Base de datos y Extremo a extremo. Logs remotos: pgTAP 17/477 PASS,
integración PostgREST ejecutada y E2E 108 passed + 4 skipped. Calidad omite
la integración local gated; el trabajo de base de datos la ejecuta por separado.
Auditoría previa: .env.local, roadmap y artefactos de test fuera de Git;
patrones de claves privadas/tokens sin coincidencias en los archivos públicos.
Se revisó el árbol completo de 70 archivos antes de publicar.

Esta actualización registra el run de implementación ya terminado; cualquier
revisión posterior y el commit de integración deben tener también sus tres
trabajos verdes. No se etiqueta ni declara producción basándose en esa CI.

Producción no está configurada/identificada en el contexto disponible. La base
actual es local; GitHub registra cero despliegues. Se encontró Vercel disponible
sin conexión y se propuso conectarlo. Q-007 recoge destino, acceso y política de
rama. No se crean proveedores, cuentas ni planes por inferencia. Un build y CI
verdes no equivalen a una web desplegada.

## Límites

Las cifras son estimaciones: otro instante de commit, memoria concurrente y fuzz
pueden cambiarlas. Se formatean duraciones del servidor, sin reloj ni FSRS del
navegador. El reveal sigue siendo lectura y la elección local sigue sin guardar.
Sin avance, intervalo persistido, migración de memoria o nueva preferencia global.
No se inicia LEX-6.7. Q-005/Q-006 y revisión independiente siguen abiertas.
