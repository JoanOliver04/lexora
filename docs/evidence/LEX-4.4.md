# LEX-4.4 — Implementar preview y mapeo de columnas

**Fecha:** 2026-09-05
**Rama:** `feat/lex-4-4-import-preview`
**Estado resultante:** `HECHO`. PR #53 fusionada a `main` (merge `b658c78`);
CI verde en los tres trabajos, runs `33984578999` (PR) y `33984795076`
(merge).

---

## 1. Alcance

Primera pantalla de importación (MASTER_SPEC §9.7, pasos 1–4): elegir
archivo, ver el separador detectado, una muestra acotada de filas y un
formulario para mapear qué columna es frente/reverso/etiquetas. El criterio
es explícito: **sin persistir cambios** — nada de `import_jobs`, nada de
conceptos/ítems. Es lectura sobre el resultado del parser de LEX-4.2.

**Entregado:**

- **Ruta `src/app/[locale]/(app)/import/`:** `page.tsx` (puerta de
  onboarding + curso activo, como el resto de `(app)`), `import-preview-
  form.tsx` (cliente, `useActionState`), `actions.ts` (`previewImportAction`).
- **`previewImportAction`:** lee el `File` del formulario, `await
  file.text()`, lo parsea con `createDelimitedFileParser()` (composición
  LEX-4.2). Devuelve separador + `separatorFromDirective`, recuentos del
  archivo completo (mapeo por defecto del parser), y una **muestra acotada
  a 50 filas** ya mapeada. Cambiar el mapeo **no re-sube el archivo**: la
  muestra tokenizada viaja en un campo oculto `carried` (JSON, ~50 filas
  cortas — pocos KB) y la acción reasigna con `mapPreviewRows`.
- **Mapeo:** tres `<select>` (frente / reverso / etiquetas), opciones
  `Columna 1..N` según `columnCount` que ahora devuelve el parser; etiquetas
  con opción «(sin etiquetas)». Por defecto 1/2/3.
- **Módulo `importing` ampliado:**
  - `domain/row.ts` — `RawImportRow` (`{ rowNumber, columns }`).
  - `domain/column-mapping.ts` (nuevo) — `ColumnMapping`,
    `DEFAULT_COLUMN_MAPPING`, `applyColumnMapping(rawRows, mapping)`: índices
    0-indexados independientes para frente/reverso/tags, tolera más de 3
    columnas (las no mapeadas se ignoran), un índice mapeado que no existe
    en la fila → `too_few_columns`, frente/reverso en blanco → su código.
  - `application/preview.ts` (nuevo) — `mapPreviewRows`, borde de capas
    (la presentación llama a `application/`, no a `domain/`).
  - `application/delimited-file-parser.ts` — `ParseFileResult` gana
    `columnCount` y `rawRows` (additivo; los tests de LEX-4.2 comprueban
    campo a campo, no rompen).
- **i18n:** namespace `Import` ES/EN; enlace «Importar» desde el shell.

**Fuera de alcance, declarado:**

- Elegir mazo de destino y dirección inversa (§9.7 pasos 5–6).
- Clasificación de duplicados (LEX-4.6).
- **Límites duros (5 MB / 10.000 filas) y saneamiento real** (LEX-4.5,
  §16.2–16.3). Aquí el archivo se lee entero en memoria; el tope no se
  aplica todavía — anotado como riesgo (§5).
- Ejecutar la importación y escribir `import_jobs` (LEX-4.7+). La pantalla
  termina en «esto es lo que se va a importar», sin botón de confirmar.

## 2. Tests

**Unitarios** (`pnpm test`, vitest): `domain/column-mapping.test.ts` (6:
mapeo por defecto, reasignar columnas, sin columna de tags, índice mapeado
inexistente → `too_few_columns`, frente/reverso en blanco, mapear entre 5
columnas). 229/229 en verde (32 ficheros). Los tests de LEX-4.2 siguen
verdes con los campos nuevos.

**E2E** (`pnpm e2e`, Playwright): `tests/e2e/import-preview.spec.ts` (nuevo,
2 casos ×2 dispositivos):

- Subir `basic-tab.txt`: separador «tabulación» detectado, «2 filas
  válidas · sin problemas», la primera fila muestra `break the ice` /
  `romper el hielo`. Intercambiar frente↔reverso con los `<select>` **sin
  volver a subir el archivo** → la muestra se re-pinta con las columnas
  cambiadas.
- Subir `errors.txt`: «0 filas válidas · 4 con problemas», la lista de
  problemas de la muestra nombra la fila 1 (frente en blanco) y la fila 2
  (reverso en blanco).

80/80 e2e en verde (22 ficheros; +1 fichero).

**pgTAP** sin cambios: `pnpm db:test` 12 ficheros / 308, PASS.

## 3. Puertas

```text
pnpm check   exit 0 (format, lint, typecheck, contraste 18/18, vitest 32/229, build)
pnpm db:test 12 ficheros / 308 aserciones, PASS (sin cambios: sin migración)
pnpm e2e     80 passed (22 ficheros; import-preview.spec.ts nuevo)
```

## 4. Archivos

| Archivo | Cambio |
|---|---|
| `src/app/[locale]/(app)/import/page.tsx` | Nuevo. Pantalla. |
| `src/app/[locale]/(app)/import/import-preview-form.tsx` | Nuevo. Formulario cliente. |
| `src/app/[locale]/(app)/import/actions.ts` | Nuevo. `previewImportAction`. |
| `src/modules/importing/domain/row.ts` | +`RawImportRow`. |
| `src/modules/importing/domain/column-mapping.ts` | Nuevo. `applyColumnMapping`. |
| `src/modules/importing/domain/column-mapping.test.ts` | Nuevo. |
| `src/modules/importing/application/preview.ts` | Nuevo. `mapPreviewRows`. |
| `src/modules/importing/application/delimited-file-parser.ts` | +`columnCount`, +`rawRows` en `ParseFileResult`. |
| `src/modules/importing/infrastructure/papaparse-delimited-file-parser.ts` | Puebla los campos nuevos. |
| `src/app/[locale]/(app)/app/page.tsx` | +enlace «Importar». |
| `messages/{es,en}.json` | Namespace `Import` + `App.importLink`. |
| `tests/e2e/import-preview.spec.ts` | Nuevo. 2 casos. |
| `docs/evidence/LEX-4.4.md` | Este informe. |

Migraciones: **0**.

## 5. Riesgos y deuda

- **Sin límite de tamaño/filas todavía (LEX-4.5).** El archivo se lee entero
  con `file.text()`. Un archivo enorme podría cargar mucho en memoria de la
  Server Action antes de que LEX-4.5 ponga el tope. Aceptado como deuda de
  esta tarea: el criterio de salida no incluye los límites, y meterlos aquí
  a medias (sin el saneamiento que los acompaña en §16.2) sería peor.
- **Recuentos del archivo completo con el mapeo por defecto del parser.**
  Cambiar el mapeo actualiza la **muestra** (50 filas) pero no re-cuenta el
  archivo entero — eso necesitaría el archivo, que ya no está. La UI lo
  etiqueta «(con el mapeo por defecto)». La validación completa fila a fila
  es LEX-4.5.
- **`carried` en un campo oculto:** 50 filas tokenizadas como JSON. Pocos
  KB para las fixtures; con filas muy largas podría crecer. LEX-4.5, que
  introduce los límites de longitud de campo, lo acota de forma natural.
- Deuda arrastrada: revisión cruzada independiente §3.6 (FASE 4). Sin
  segundo agente — mismo motivo ambiental que `docs/evidence/LEX-3.12.md` §4.

## 6. Estado del árbol Git

Rama `feat/lex-4-4-import-preview` desde `main` (`6c870e1`), fusionada.
`main` en `b658c78`. Cierre de documentación en `docs/lex-4-4-close`.

## 7. Siguiente tarea

**LEX-4.5** — Validar y sanear entradas: UTF-8, 5 MB / 10.000 filas
iniciales, límites de campo, nombre de fichero saneado, HTML no ejecutable,
errores seguros y protección frente a agotamiento. Depende de LEX-4.2. No se
inicia aquí.
