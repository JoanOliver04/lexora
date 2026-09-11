# LEX-5.3 — Configuración FSRS v1

**Fecha:** 2026-09-11
**Rama:** `feat/lex-5-3-fsrs-v1-config`
**Estado resultante:** `HECHO`. PR #73 fusionada a `main` (merge `6ff8b5d`);
CI verde en los tres trabajos, runs `34596435352` (PR) y `34596876298`
(merge).

---

## 1. Alcance

Congelar los valores de producto, serializarlos y versionarlos.
Validar el JSON en el borde (Zod). **Sin UI. Sin migración.**

**Entregado:**

- **`V1_SCHEDULER_CONFIG`** (`configVersion: "v1"`): retención 0,90,
  pasos `1m`/`10m` y relearn `10m`, intervalo 36500 días, fuzz
  **encendido**, 21 pesos FSRS-6 copiados de `ts-fsrs@5.4.2`.
- Zod `versionedSchedulerConfigSchema` +
  `parse`/`serialize`/`read`. El dominio sigue validando reglas.
- El adaptador pasa `w` explícitos: un parche de la librería no
  cambia el calendario.

**Fuera de alcance:** UI; `learning_states` (LEX-5.4); optimizar `w`.

## 2. Decisiones

- **Retención 0,90:** default de la librería y punto de partida
  acordado. La documentación vigente no recomienda otro valor.
- **Fuzz on:** evita vencimientos agrupados. Sembrado. Los tests
  congelados de LEX-5.2 apagan el fuzz para leer minutos exactos.
- **Intervalo 36500 días:** default de la librería / FSRS en Anki.
  No se acorta sin datos de uso.
- **Pesos copiados, no leídos en caliente** de `default_w`. Si un
  upgrade los cambia, el test del adaptador falla y hay que decidir
  un `v2`.

## 3. Tests

Dominio: v1 válida; pesos ≠ 21 se rechazan. Aplicación: parse v1,
versión desconocida, retención 0,5 (forma ok, dominio no), JSON
ida/vuelta. Adaptador: `default_w` = pesos v1; v1 con fuzz programa.

## 4. Puertas

```text
pnpm check    exit 0 (format, lint, typecheck, contraste 18/18,
               vitest 49 ficheros / 312 passed / 1 skipped, build)
```

Sin migración. Sin e2e extra.

## 5. Archivos

`scheduler-config.ts` (dominio + application), tests, adaptador (`w`),
`docs/FSRS.md`, evidencia.

Migraciones: **0**.

## 6. Siguiente

**LEX-5.4** — Migraciones de `learning_states`, `study_sessions` y
`review_logs`. No empezada.
