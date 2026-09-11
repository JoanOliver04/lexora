# LEX-5.1 — Spike controlado de `ts-fsrs`

**Fecha:** 2026-09-11
**Rama:** `feat/lex-5-1-ts-fsrs-spike`
**Estado resultante:** `HECHO`. PR #69 fusionada a `main` (merge `74959e6`);
CI verde en los tres trabajos, runs `34589353696` (PR) y `34589815103`
(merge).

---

## 1. Alcance

Ensayo de la versión vigente de `ts-fsrs` contra su documentación
oficial. Versión fijada. Decisiones en `docs/FSRS.md`. **Sin UI, sin
puerto, sin módulo `study`.** Eso es LEX-5.2.

**Entregado:**

- **`ts-fsrs@5.4.2`** en `dependencies` (no `6.0.0-beta`: no es
  `latest`; un major exige ADR + migración).
- `FSRSVersion` = `v5.4.2 using FSRS-6.0`. Node `>=20` (Lexora 24).
  MIT, 0 dependencias transitivas. 21 pesos.
- Spike `tests/unit/fsrs/ts-fsrs-spike.test.ts`: estados, ratings,
  pasos cortos, fuzz sembrado, `generatorParameters` por JSON,
  `migrateParameters`, mapeo de `Date`.
- `docs/FSRS.md` actualizado. Capa de aplicación: el test de
  `layer-rules` también prohíbe `ts-fsrs` (ya estaba en eslint).

**Fuera de alcance:** `TsFsrsScheduler` (LEX-5.2); config de producto
versionada (LEX-5.3); UI; optimizador
`@open-spaced-repetition/binding`; deshacer un repaso.

## 2. Hallazgos (documentación + ejecución)

| Tema | Hallazgo |
|---|---|
| API | `fsrs(params)`, `createEmptyCard(now)`, `repeat` (preview), `next` (review). |
| Estados | `New=0 Learning=1 Review=2 Relearning=3`. |
| Ratings | Usuario: Again/Hard/Good/Easy (1–4). `Manual=0` no es `Grade`. |
| Pasos | Default `1m, 10m` / relearn `10m`. `New+Good` → Learning +10 min. `New+Easy` → Review +8 d. |
| Fuzz | Default **apagado**. Encendido cambia el intervalo largo; semilla estable. |
| Serialización | `generatorParameters()` es JSON-seguro. `Card.due` es `Date`: mapear. |
| Migración | `migrateParameters()` → 21 pesos. 5.x→6.x sigue siendo major (`elapsed_days` se va). |
| Reloj | `now` se pasa a `repeat`/`next`. No usar `Date.prototype.scheduler`. |

No se copian parámetros de otra persona. LEX-5.3 elige los de
producto a partir de estos defaults.

## 3. Puertas

```text
pnpm check    exit 0 (format, lint, typecheck, contraste 18/18,
               vitest 45 ficheros / 294 passed / 1 skipped, build)
```

Sin migración: `db:test` / `db:types` no aplican. Sin pantalla: sin
`pnpm e2e` extra (el gate general ya construye).

## 4. Archivos

`package.json` + lockfile, `docs/FSRS.md`, spike, `layer-rules.test.ts`,
evidencia.

Migraciones: **0**.

## 5. Decisiones

- **5.4.2, no el beta 6.** Estable, FSRS-6 ya, sin rotura de API.
- **Sin optimizador.** V1 no entrena `w`.
- **Sin módulo `study` todavía.** El spike vive en `tests/unit/fsrs/`.
- **Q-006 no se toca.** Condiciona LEX-5.6.

## 6. Siguiente

**LEX-5.2** — Puerto `SpacedRepetitionScheduler` y adaptador
`TsFsrsScheduler`. No empezada.
