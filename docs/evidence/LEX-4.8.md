# LEX-4.8 — Construir wizard completo de importación

**Fecha:** 2026-09-10
**Rama:** `feat/lex-4-8-import-wizard`
**Estado resultante:** `HECHO`. PR #61 fusionada a `main` (merge `8bce773`);
CI verde en los tres trabajos, runs `34484288783` (PR) y `34485416130`
(merge).

---

## 1. Alcance

La importación de LEX-4.4…4.7 vivía en un solo formulario largo. Esta
tarea la ordena en los pasos de MASTER_SPEC §9.7 1–8, con confirmación
clara, teclado y Poco F5. No hay caso de uso nuevo: `executeImport` no
cambia. El archivo sigue sin guardarse hasta confirmar.

**Entregado:**

- **Cinco pasos:** archivo → mapeo (detección + preview + columnas) →
  mazo e inversa → duplicados → confirmar. Indicador con
  `aria-current="step"`; se puede volver atrás, no adelantar.
- **Foco** en el heading del paso al cambiar (`tabIndex={-1}`).
- **Confirmación:** recap de archivo, recuentos, mazo, inversa y
  estrategia **antes** de `intent=execute`. Sin mazo no hay botón de
  importar; enlace a crear uno. Sin mazo mágico.
- **Éxito:** `FormStatus` toma el foco; «Importar otro archivo»
  remonta el formulario.
- Pasos inactivos con atributo `hidden` y **sin** clase `flex` (si no,
  la hoja de autor pisa el `display: none` del UA).

**Fuera de alcance:** progreso por fila y errores descargables
(LEX-4.9); dataset real (LEX-4.10); crear mazos embebido;
cambiar `executeImport`.

## 2. Tests

**Unitarios:** `import-wizard.test.ts` (2: orden de pasos; no saltar
adelante). vitest 42/280.

**E2E:** `import-preview.spec.ts` recorre el wizard. Caso nuevo: avanza,
vuelve atrás y deja el foco en el heading; no se puede saltar a «Mazo»
antes de visitarlo. El recap nombra el mazo. Escritorio + Poco F5.

## 3. Puertas

```text
pnpm check    exit 0 (format, lint, typecheck, contraste 18/18, vitest 42/280, build)
pnpm e2e      92 passed (import-preview.spec.ts +1: wizard foco/atrás)
```

Sin migración: `db:test` / `db:types` no aplican.

## 4. Archivos

Nuevo: `import-wizard.ts` + test. Formulario, i18n, e2e.

Migraciones: **0**.

## 5. Decisiones

- **Misma ruta, estado de cliente.** Ocho URLs no aportarían: `carried`
  ya viaja en el formulario y un refresh pierde la vista previa igual.
- **Sin mazo se puede avanzar** hasta confirmar (para ver duplicados);
  no se puede ejecutar. Crear el mazo es un enlace a `/decks`.
- **Campos de pasos ocultos siguen en el DOM** para que el submit de
  confirmar envíe mapeo, mazo, inversa y estrategia.

## 6. Siguiente

**LEX-4.9** — Progreso, resumen y errores recuperables. No empezada.
