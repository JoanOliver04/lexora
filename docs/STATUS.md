# Lexora — Estado actual

**Última actualización:** 2026-08-28
**Fase actual:** FASE 1 — Fundación técnica — 13/14 (`EN PROCESO` por LEX-1.14)
**Hito actual:** M1 — Fundación técnica reproducible — `PENDIENTE` de cierre formal
**Tarea activa:** **LEX-1.14** — auditoría completada; falta push, PR, CI verde sobre la rama y merge
**Estado de la tarea:** FASE 0 `HECHO` (8/8) · FASE 1 13/14 · LEX-1.14 `EN PROCESO`
**Rama / commit base / HEAD:** `docs/lex-1-14-clean-clone-m1`, partiendo de `main` (`451d668`); 1 commit por delante de `main`, sin empujar

> El roadmap detallado y la especificación maestra son documentos privados y
> locales; no forman parte de este repositorio público. Ver
> [`OPEN_QUESTIONS.md`](OPEN_QUESTIONS.md) Q-002.

---

## Trabajo de esta sesión

### LEX-1.14 — Verificar clon limpio y cerrar M1 — `EN PROCESO`

Informe completo en [`evidence/LEX-1.14.md`](evidence/LEX-1.14.md).

Auditoría sobre un `git clone` recién sacado de GitHub (`C:\Temp\lex114`, commit
`451d668`), no sobre el árbol de trabajo: lo que se comprueba es que no haga falta
nada que solo exista en esta máquina.

Secuencia completa en verde desde el clon:

```text
pnpm install --frozen-lockfile   500 paquetes, lockfile coincide
pnpm db:start                     stack arriba, imprime URL y clave publishable
.env.local desde .env.example     plantilla correcta
pnpm db:reset                     Reset local database.  (0 migraciones aún)
pnpm db:test                      PASS  (Files=2, Tests=2)
pnpm check                        exit 0  (formato, lint, tipos, contraste 18/18, vitest 17/17, build)
pnpm e2e                          14 passed  (escritorio + Poco F5)
pnpm start                        / → 307 → /es · /es → 200 lang="es" · /api/health → 200 ok
```

**CI verde registrada:** run `33103009623` sobre `main`, `success`, 2 m 39 s,
commit `451d668`. Runner Linux frío: es la prueba del camino desde cero real.

**Límite declarado:** la máquina local ya tenía imágenes de Docker, store de pnpm
y navegadores de Playwright en caché. El clon local prueba reproducibilidad en
una máquina ya preparada; el camino desde nada lo cubre la CI.

**Hallazgos de la auditoría, corregidos:** el README no tenía instrucciones de
instalación (añadida sección mínima; el README de portfolio sigue siendo
LEX-10.4) y afirmaba «Fase 0 de 10, sin aplicación ejecutable»; este `STATUS.md`
describía un estado anterior a FASE 1 y se ha reescrito; el roadmap privado tenía
la cabecera de FASE 1, la sección «siguiente tarea» y varios contadores
desactualizados. Detalle en el informe §5.

### FASE 1 — 13/14, cierre en curso

LEX-1.1…1.13 `HECHO`; LEX-1.14 `EN PROCESO` (falta merge + CI). Cada tarea tiene
su informe en [`evidence/`](evidence/):

| Tarea | Entregable |
|---|---|
| LEX-1.1 | Aplicación Next.js 16 + React 19 + TS estricto + pnpm |
| LEX-1.2 | Calidad base: scripts canónicos, TS endurecido, Prettier |
| LEX-1.3 | Estructura modular y regla de dependencia exigible por lint |
| LEX-1.4 | Validación de entorno con Zod, servidor/cliente separados |
| LEX-1.5 | Internacionalización ES/EN con `next-intl`, enrutado `/[locale]` |
| LEX-1.6 | Sistema visual base: tokens oklch, tres temas, contraste ejecutable |
| LEX-1.7 | Supabase local vía CLI del proyecto; cierra Q-003 |
| LEX-1.8 | Clientes Supabase SSR, ninguno privilegiado; `getSession()` prohibido |
| LEX-1.9 | Vitest + RTL; regresión automática de la regla de capas |
| LEX-1.10 | pgTAP y arnés de base de datos; invariante permanente de RLS |
| LEX-1.11 | Playwright: escritorio y Poco F5 real, contra build de producción |
| LEX-1.12 | CI en GitHub Actions, tres trabajos; cierra Q-004 |
| LEX-1.13 | Landing ES/EN y health check que no filtra; raíz de composición |
| LEX-1.14 | Clon limpio verificado en local; cierre pendiente de merge + CI |

### FASE 0 — cerrada (8/8)

M0 completo: repositorio, documentación de gobierno, ADR-001…004, specs técnicas,
protocolo del agente, workflow, glosario y política de contenido. Auditoría en
[`evidence/LEX-0.8.md`](evidence/LEX-0.8.md). Etiqueta `v0.1.0-m0`.

### Frontera público / privado

| Contenido | Ubicación | ¿En Git? |
|---|---|---|
| Especificación maestra | `docs/no_visible_en_github/MASTER_SPEC.md` | **No** |
| Roadmap detallado | `docs/no_visible_en_github/ROADMAP.md` | **No** |
| Material privado de Anki | `docs/no_visible_en_github/` | **No** |
| Estado y preguntas abiertas | `docs/STATUS.md`, `docs/OPEN_QUESTIONS.md` | Sí |
| ADR y evidencia | `docs/adrs/`, `docs/evidence/` | Sí |
| Protocolo del agente | `CLAUDE.md` | Sí |
| Presentación del proyecto | `README.md` | Sí |

---

## Trabajo todavía abierto

**LEX-1.14** está `EN PROCESO`. La auditoría y las correcciones están hechas y
committeadas en la rama `docs/lex-1-14-clean-clone-m1`; falta el cierre formal:

1. Autorización de Joan para empujar la rama y abrir el PR.
2. `git push -u origin docs/lex-1-14-clean-clone-m1` + PR con el ID en el título.
3. CI verde sobre la rama.
4. Merge a `main`.
5. Marcar LEX-1.14 `HECHO` y M1 cerrado en el roadmap; decidir la etiqueta
   `v0.2.0-m1`.

Después, la siguiente fase es **FASE 2 — Identidad, onboarding y curso**
(`PENDIENTE`, 0/11), que empieza por LEX-2.1.

---

## Archivos y migraciones afectados en esta sesión

| Archivo | Cambio |
|---|---|
| `docs/evidence/LEX-1.14.md` | Creado. Informe de la verificación del clon limpio. |
| `README.md` | Añadida sección «Puesta en marcha local»; corregida la nota de estado. |
| `docs/STATUS.md` | Reescrito: instantánea de FASE 1 en 13/14, sin narrativa de FASE 0. |

Migraciones SQL: ninguna. Todavía no existe base de datos con tablas; `db:reset`
aplica cero migraciones y una semilla vacía.

---

## Verificaciones ejecutadas y resultados

### Entorno de desarrollo

| Herramienta | Versión |
|---|---|
| Git | 2.39.0.windows.2 |
| Node.js | 24.19.0, gestionado con nvm-windows (`.nvmrc`) |
| pnpm | 11.24.0, vía corepack |
| Docker | Desktop 4.88.1, motor 29.7.2 |
| CLI de Supabase | 2.116.0, dependencia de desarrollo del proyecto |

### Puertas de calidad — clon limpio, 2026-08-28

```text
pnpm check   exit 0
  prettier --check .            All matched files use Prettier code style!
  eslint                        sin hallazgos
  next typegen && tsc --noEmit  ✓ Types generated successfully
  check-contrast.mjs            18/18 combinaciones
  vitest run                    3 archivos, 17 tests
  next build                    ✓ Compiled successfully  (/es, /en, ƒ /api/health)
pnpm e2e     14 passed  (escritorio-chromium + movil-poco-f5)
pnpm db:test PASS  (pgTAP, Files=2 Tests=2)
```

### CI

```text
run 33103009623   CI   main   push   success   2m39s   2026-08-27T18:20:53Z
commit 451d668
```

---

## Verificaciones manuales pendientes

Corresponden a Joan:

1. **Autorizar el push de la rama `docs/lex-1-14-clean-clone-m1` y su PR**, y la
   fusión a `main` tras CI verde.
2. **Decidir si se crea y publica la etiqueta `v0.2.0-m1`.** WORKFLOW §8 la
   contempla al cerrar un hito desplegable; empujarla al remoto público requiere
   autorización explícita (la de Q-004 cubría solo aquel primer push).
3. Mantener una copia de seguridad de `docs/no_visible_en_github/` fuera del
   proyecto: Git no protege esos archivos.

---

## Bloqueos y preguntas

| ID | Asunto | Estado |
|---|---|---|
| Q-001 | Visibilidad de `CLAUDE.md` | `RESUELTA` — público |
| Q-002 | Qué documentación es pública | `RESUELTA` — privado el diseño, público el método |
| Q-003 | Herramientas de desarrollo | `RESUELTA` |
| Q-004 | Primer push al remoto público | `RESUELTA` |

Ninguna abierta. Tras cerrar LEX-1.14, FASE 2 puede empezar sin bloqueos.

---

## Riesgos o deuda conocida

- **Al mover o renombrar una ruta, `pnpm typecheck` falla hasta borrar `.next`.**
  Los tipos generados describen el árbol anterior. Es caché, no un error del
  código; la CI no lo sufre porque parte de un árbol limpio.
- **ESLint corre sobre una línea sin soporte (9.39.5).** Bloqueante:
  `eslint-plugin-react` no soporta ESLint 10. Riesgo bajo —herramienta de
  desarrollo, no se despliega—. Revisar al actualizar Next.js o antes de LEX-9.9.
- **El repositorio es público desde el primer commit.** Cualquier archivo
  confirmado una vez queda permanentemente en el historial y en los forks.
  Comprobar `git status` antes de cada commit.
- **`MASTER_SPEC.md` y `ROADMAP.md` quedan fuera de Git:** sin historial, sin
  copia de seguridad y sin revisión por PR. Riesgo real de pérdida por borrado
  accidental.
- **En esta máquina, un Node 22 propio en `C:\Program Files\nodejs` tapa el shim
  de nvm-windows.** `nvm use` no basta en una terminal sin privilegios. No afecta
  al repositorio; anotado para no volver a tropezar.
- Sin `LICENSE`. Repositorio público sin licencia = todos los derechos reservados
  por defecto. Debe decidirse antes de la publicación de la V1 (LEX-10.10).

---

## Siguiente acción exacta

**Cerrar LEX-1.14.** Con la autorización de Joan: `git push -u origin
docs/lex-1-14-clean-clone-m1`, abrir el PR (ID en el título), esperar CI verde,
fusionar a `main`. Entonces marcar LEX-1.14 `HECHO` y M1 cerrado en el roadmap,
actualizar este archivo y decidir la etiqueta `v0.2.0-m1`.

Después, y solo después, empezar **FASE 2** por **LEX-2.1** — la migración de
`profiles`, `languages`, `courses` y `course_settings`: UUID, claves foráneas,
checks, timestamps, timezone IANA, locales y rangos de configuración, con
`DATA_MODEL.md` actualizado. Es la primera tarea que crea esquema; aplica el gate
de migraciones, PostgreSQL y RLS (roadmap §12.3) además del general.

---

## Qué no debe aparecer en este documento

Este archivo es público y se actualiza en cada tarea. Nunca debe contener:

- títulos, descripciones o criterios de tareas futuras del roadmap privado;
- contenido copiado de `MASTER_SPEC.md`;
- URLs de proyecto, *project refs*, claves o cadenas de conexión de Supabase;
- correos, rutas locales de la máquina del propietario o identificadores personales;
- nombres o contenido de los mazos privados de Anki usados como material de prueba;
- salidas de comandos sin revisar, que puedan arrastrar cualquiera de los anteriores.

Referencias por ID (`LEX-n.m`, `Q-nnn`) sí: identifican sin revelar.

---

## Estado de git

- Rama por defecto: `main`, en `451d668`, sincronizada con `origin/main`.
- Remoto: `origin` → `https://github.com/JoanOliver04/lexora.git` (**público**).
  33 commits publicados, etiqueta `v0.1.0-m0` publicada.
- Rama de trabajo actual: `docs/lex-1-14-clean-clone-m1`, 1 commit por delante de
  `main`, **sin empujar**. Contiene los cambios de LEX-1.14 (README, STATUS,
  evidencia).
- Contenido versionado: aplicación Next.js completa, `supabase/` (config, seed,
  tests), CI, documentación en `docs/` y ADR.
