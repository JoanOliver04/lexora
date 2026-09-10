# LEX-4.6 — Implementar plan de duplicados

**Fecha:** 2026-09-10
**Rama:** `feat/lex-4-6-duplicate-plan`
**Estado resultante:** `HECHO`. PR #57 fusionada a `main` (merge `19efe26`);
CI verde en los tres trabajos, runs `34476806540` (PR) y `34477343160`
(merge).

---

## 1. Alcance

La vista previa de LEX-4.4/4.5 no decía si una fila ya existía en el curso.
Esta tarea clasifica cada fila **válida del archivo completo** (no solo las
50 de muestra) como nueva o posible duplicada, y deja elegir la estrategia
**antes** de importar. No persiste nada; ejecutar es LEX-4.7.

**Entregado:**

- **`domain/duplicates.ts`:** `classifyImportRows` — duplicada si la
  `canonical_key` del frente ya está en el curso **o** ya apareció antes
  en el archivo. Estrategias `skip` (por defecto, no destructiva) y
  `copy`. `parseDuplicateStrategy` ignora cualquier otro valor.
- **`application/duplicates.ts`:** `planImportDuplicates` — una sola
  `ConceptRepository.list` del curso activo, claves con `canonicalKey`
  de biblioteca (LEX-3.10, acentos conservados), clasificación en
  memoria. No un `find` por fila.
- **Vista previa:** recuentos nuevas/duplicadas/inválidas con el **mapeo
  actual** (ya no «con el mapeo por defecto»). Radios omitir/copia.
  Lista acotada (20) de posibles duplicados, con título existente o
  filas hermanas del archivo.
- **`carried.rawRows`:** el archivo tokenizado completo, para remapear y
  reclasificar sin re-subir.

**Actualizar coincidencias, fuera a propósito.** No hay un criterio
seguro de «es el mismo concepto, solo cambia un campo». Un `UPDATE` por
título igual pisaría contenido e historial futuro. Queda documentado en
`IMPORT_FORMAT.md` y `SECURITY.md`. Si más adelante hay una identidad
más fuerte (hash de frente+reverso, o confirmación fila a fila), se
añade como tercera estrategia.

**Fuera de alcance, declarado:** ejecutar la importación (LEX-4.7);
wizard completo (LEX-4.8); fusionar conceptos; deduplicación semántica;
migración (no hace falta un código `duplicate` en el enum todavía).

## 2. Tests

**Unitarios:** `duplicates.test.ts` dominio (5) y aplicación (3).
`pnpm check` → vitest 39 ficheros / 270 tests.

**E2E:** `import-preview.spec.ts` +2 casos ×2 dispositivos:

- Concepto «Break the ice» ya en el curso + `basic-tab.txt` → 1 nueva
  (take off) y 1 posible duplicada; el aviso nombra el concepto; elegir
  copia sobrevive al re-envío.
- Dos frentes `hello` en el mismo archivo → la segunda es duplicada
  «también en filas 1».

El caso de `errors.txt` se ajusta: con el mapeo, las columnas de más se
ignoran, así que la cuarta fila es válida (1 válida · 3 con problemas).
Antes el recuento venía del parser estricto de tres columnas.

## 3. Puertas

```text
pnpm check   exit 0 (format, lint, typecheck, contraste 18/18, vitest 39/270, build)
pnpm e2e     88 passed (22 ficheros; import-preview.spec.ts +2 casos)
```

Sin migración: `db:test` / `db:types` no aplican.

## 4. Archivos

| Archivo | Cambio |
|---|---|
| `src/modules/importing/domain/duplicates.ts` | Clasificación y estrategias. |
| `src/modules/importing/application/duplicates.ts` | `planImportDuplicates`. |
| `src/app/[locale]/(app)/import/actions.ts` | Clasifica el archivo completo. |
| `src/app/[locale]/(app)/import/import-preview-form.tsx` | Recuentos, radios, lista. |
| `messages/{es,en}.json` | Namespace `Import.plan`. |
| `docs/IMPORT_FORMAT.md`, `docs/SECURITY.md` | Criterio skip/copy, sin update. |
| `tests/e2e/import-preview.spec.ts` | +2 casos; recuentos actualizados. |

Migraciones: **0**.

## 5. Decisiones

- **Skip por defecto.** Es lo no destructivo. Copy es explícito, como
  «Crear de todos modos» en LEX-3.10.
- **Listar el curso entero una vez**, no `findByCanonicalKey` por fila.
  El volumen de la V1 cabe; un `.in()` de 10.000 claves reventaría la
  URL de PostgREST.
- **Recuentos con el mapeo actual.** Consecuencia de clasificar el
  archivo completo tras `applyColumnMapping`.

## 6. Riesgos y deuda

- `carried` ahora lleva todas las filas tokenizadas. A 10.000 filas
  cortas son ~1 MB; un archivo de 5 MB con campos largos podría
  acercarse al tope de 6 MB del cuerpo. Aceptado: el tope de archivo
  ya es 5 MB.
- La estrategia se recuerda en el formulario, no en `import_jobs`
  (eso es LEX-4.7).

## 7. Siguiente

**LEX-4.7** — Caso de uso de importación por lotes. No empezada.
