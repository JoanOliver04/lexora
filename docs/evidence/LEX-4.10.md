# LEX-4.10 — Probar archivos privados reales y rendimiento

**Fecha:** 2026-09-10
**Rama:** `feat/lex-4-10-private-import`
**Estado resultante:** `HECHO`. PR #65 fusionada a `main` (merge `84e2dc2`);
CI verde en los tres trabajos, runs `34492145918` (PR) y `34492734105`
(merge).

---

## 1. Alcance

LEX-4.1 caracterizó el formato público de Anki con fixtures sintéticas
porque el dataset real no estaba en el clon. Esta tarea lo contrasta
con los 10 TXT privados (~1.016 filas), importa uno y el conjunto, y
registra esperado vs obtenido, duración y memoria. Los originales no
se tocan ni se versionan.

**Entregado:**

- **Caracterización contra el dataset real.** 10 TXT, 1.016 filas de
  datos. Todos `#separator:tab`, `#html:false`, `#tags column:3`,
  `#notetype:Basic`. Sin BOM. 3 columnas. Etiquetas `::` en cada fila.
  Directivas desconocidas (`#notetype:<nombre>`) no se leen como dato.
  Frente máximo 76 / reverso 69 / campo de etiquetas 35 — muy por
  debajo de los topes de LEX-4.5.
- **Parser TSV:** Anki mete `"` literales sin escapar RFC 4180. El
  `quoteChar` por defecto de Papa fusionaba filas y fabricaba
  `too_few_columns`. El adaptador desactiva el quote char **solo** si
  el separador es tab. CSV sigue RFC 4180. Fixture pública
  `quotes-in-tab.txt` (sintético).
- **Parseo:** 1.016 válidas, 0 problemas, 1.013 claves canónicas
  distintas (3 duplicados intra-conjunto). SHA-256 de cada original
  idéntico antes y después. Duración 14–93 ms (re-medido: 22 ms).
  Δ heap ~3,95 MB.
- **Wizard, un archivo:** `A1_Pronunciacion.txt` → 44 creadas, 0
  fallidas, total 44. Escritorio ~3,4 s; Poco F5 ~3,9 s.
- **Wizard, conjunto:** 1.016 filas (directiva + cuerpos, en memoria;
  no se escribe un fichero combinado). 1.013 creadas, 3 omitidas, 3
  duplicadas, 0 fallidas, total 1.016. ~110 s (~108 ms/fila).
- **Tests privados** detrás de `LEXORA_PRIVATE_IMPORT_DIR`. Sin la
  variable, CI y clones los saltan. Ninguna aserción sobre el texto
  de las tarjetas.

**Fuera de alcance:** auditoría M4 (LEX-4.11); publicar el dataset;
huecos `____` como `cloze` (entran como `basic_recognition`); cola
asíncrona / timeout de Server Action en hosting (el lote local de
1.016 cabe; un deploy con tope de ~10 s no).

## 2. Dataset (solo recuentos)

| Fichero | Filas de datos |
|---|---|
| `A1_Funciones.txt` | 43 |
| `A1_Gramatica.txt` | 160 |
| `A1_Pronunciacion.txt` | 44 |
| `A1_Vocabulario.txt` | 107 |
| `A2_Gramatica.txt` | 124 |
| `A2_Vocabulario.txt` | 110 |
| `B1_Gramatica.txt` | 121 |
| `B1_Vocabulario.txt` | 109 |
| `B2_Gramatica.txt` | 105 |
| `B2_Vocabulario.txt` | 93 |
| **Total** | **1.016** |

Contenido de las tarjetas y la ruta del propietario **no** se
versionan.

## 3. Esperado vs obtenido

| Prueba | Esperado | Obtenido |
|---|---|---|
| Parseo de los 10 TXT | 1.016 válidas, 0 problemas | 1.016 / 0 |
| Claves canónicas | 1.013 distintas | 1.013 (3 intra-archivo) |
| Originales en disco | SHA-256 intacto | intacto |
| `A1_Pronunciacion.txt` | 44 creadas, 0 fallidas | 44 / 0 |
| Conjunto 1.016 (`skip`) | 1.013 creadas, 3 omitidas, 0 fallidas | 1.013 / 3 / 0 |

Antes del arreglo de `quoteChar` el parseo caía a 650 válidas
(`too_few_columns` fantasma en gramática y vocabulario A1). Tras el
arreglo, 1.016.

## 4. Rendimiento

```text
parser (10 TXT, vitest, heapUsed)
  elapsedMs     14 … 93 (re-medido 22)
  heapDelta     3_952_424 bytes

wizard A1_Pronunciacion.txt (44 filas)
  escritorio-chromium   3401 ms
  movil-poco-f5         3912 ms

wizard conjunto 1.016 (escritorio)
  elapsedMs    110192
  ~108 ms/fila
```

Gate 12.5 pide el conjunto de 1.016 medido. Cabe en local. El tope
de 10.000 filas / 5 MB de LEX-4.5 no se acerca (el material real es
órdenes de magnitud menor). Un hosting con timeout corto de Server
Action no aguantaría ~110 s: eso es de LEX-4.11 / despliegue, no de
esta tarea.

## 5. Tests

**Unitarios públicos:** fixture `quotes-in-tab.txt` + caso en
`papaparse-delimited-file-parser.test.ts`. CSV entrecomillado no
cambia.

**Unitarios privados:** `tests/unit/importing/private-dataset.measure.test.ts`
(`skipIf` sin env). Recuentos, claves, hashes, duración y heap. Sin
texto de tarjetas.

**E2E privados:** `tests/e2e/private-import.spec.ts`. A1 en ambos
proyectos; el lote de 1.016 solo en escritorio (`test.setTimeout(240_000)`:
el timeout por defecto de 30 s mataba la espera de 180 s). El conjunto
se arma en un `Buffer` (`setInputFiles`); no hay fichero combinado en
el repo.

**E2E públicos:** sin la variable de entorno los 4 casos privados se
saltan.

## 6. Puertas

```text
pnpm check    exit 0 (format, lint, typecheck, contraste 18/18,
               vitest 44 ficheros / 283 passed / 1 skipped, build)
pnpm e2e      94 passed, 4 skipped (privados, sin env).
              El flake previo de import-preview.spec.ts:105
              (Poco F5, radio de copia) no se reprodujo.
```

Sin migración: `db:test` / `db:types` no aplican.

## 7. Archivos

| Archivo | Cambio |
|---|---|
| `papaparse-delimited-file-parser.ts` | `quoteChar: "\0"` en TSV. |
| `papaparse-delimited-file-parser.test.ts` | Caso de comillas literales. |
| `tests/fixtures/import/quotes-in-tab.txt` | Fixture sintético. |
| `tests/unit/importing/private-dataset.measure.test.ts` | Nuevo. Gated. |
| `tests/e2e/private-import.spec.ts` | Nuevo. Gated. |
| `docs/IMPORT_FORMAT.md` | Dataset real, `#notetype:<nombre>`, TSV vs RFC. |
| `src/modules/README.md` | Menciona LEX-4.10. |
| `docs/evidence/LEX-4.10.md` | Este informe. |

Migraciones: **0**.

## 8. Decisiones

- **No versionar el material.** Tests gated; el lote combinado viaja
  en memoria. Recuentos sí, texto no.
- **Quote char solo en TSV.** El CSV de Anki/Excel sí entrecomilla.
  Un `quoteChar` global rompería `quoted-fields.csv`.
- **`#notetype:Basic` se ignora.** Empieza por `#` en cabecera; no hay
  equivalente en Lexora (el mazo se elige en el wizard).
- **Huecos `____` no son cloze.** Fuera de alcance: el lote crea
  `basic_recognition`. Convertirlos sería producto de otra tarea.
- **Timeout del e2e de 1.016.** Playwright mata el test a los 30 s
  aunque la aserción espere 180 s. `test.setTimeout(240_000)`.

## 9. Siguiente

**LEX-4.11** — Auditoría de seguridad, E2E y cierre de M4. No empezada.
