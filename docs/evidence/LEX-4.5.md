# LEX-4.5 — Validar y sanear entradas

**Fecha:** 2026-09-10
**Rama:** `feat/lex-4-5-validate-sanitize`
**Estado resultante:** `HECHO`. PR #55 fusionada a `main` (merge `8d1afa7`);
CI verde en los tres trabajos, runs `34472011398` (PR) y `34472458601`
(merge).

---

## 1. Alcance

LEX-4.4 leía el archivo entero en memoria y no aplicaba ningún tope. Esta
tarea pone las barreras de MASTER_SPEC §16.2–16.3 sobre esa pantalla y sobre
el dominio de importación.

**Entregado:**

- **Límites duros antes de parsear** (`domain/limits.ts`,
  `inspectImportUpload`): 5 MB y 10.000 filas. `previewImportAction`
  rechaza por `File.size` **antes** de `file.text()`, para que un archivo
  enorme no se cargue en la Server Action. Códigos seguros `too-large` /
  `too-many-rows`.
- **Longitud de campo** propia del import (feature-first, no se importan
  los topes de `library/domain/taxonomy.ts`): frente/reverso 4.000,
  campo de etiquetas 2.000. Códigos `front_too_long` / `back_too_long` /
  `tags_too_long`. `classifyFields` lo comparte `classifyRow` y
  `applyColumnMapping`.
- **Nombre de archivo saneado** (`domain/filename.ts`): último segmento,
  sin controles ni `..`, recorte a 255, reserva `import.txt`.
- **HTML → texto plano** (`domain/sanitize.ts`): siempre, no solo con
  `#html:true`. El contenido de `script`/`style`/`iframe` se descarta;
  un `<` que no es etiqueta (`3 < 5`) se conserva. React sigue sin
  `dangerouslySetInnerHTML` — esta función es defensa en profundidad.
- **`row_sample` segura:** sin controles, ≤ 200 caracteres (el CHECK de
  columna admite 500). La lista de problemas de la vista previa muestra
  esa muestra.
- **Migración `20260910120000_import_error_codes_validation`:**
  `alter type public.import_error_code add value` para los tres códigos
  de longitud. `database.types.ts` regenerado en el mismo cambio.
- **Tope de cuerpo de Server Action a 6 MB** (`next.config.ts`): el
  default de Next.js es 1 MB; 6 deja holgura multipart alrededor del
  tope de 5 MB. Un archivo de más de 5 MB sigue rechazándose en la
  acción.
- **i18n** ES/EN: códigos nuevos, hint bajo el selector de archivo.
- **`docs/SECURITY.md`** (nuevo): cómo se aplican las barreras, sin
  copiar la spec privada.

**Fuera de alcance, declarado:** rate limiting / cuotas de importación;
ejecutar la importación (LEX-4.7+); duplicados (LEX-4.6); neutralizar
fórmulas al exportar CSV (FASE 8).

## 2. Tests

**Unitarios** (`pnpm test`, vitest): 37 ficheros / 262 tests. Nuevos:
`limits.test.ts`, `filename.test.ts`, `sanitize.test.ts`,
`preview.test.ts`, `import-error-keys.test.ts`; ampliados `row`,
`column-mapping` y el parser (fixture `html-tags.txt`).

**pgTAP** `110-import-jobs.sql`: 42 → 45 aserciones. El enum declara
las siete labels; un `cast` a cada código nuevo prueba que `ADD VALUE`
registró el valor (un `ADD VALUE` omitido aborta con `22P02`).

**E2E** (`pnpm e2e`): 84 passed (22 ficheros). `import-preview.spec.ts`
+2 casos ×2 dispositivos: archivo > 5 MB rechazado sin vista previa;
HTML se muestra como texto plano y un frente de 4.001 caracteres se
lista como `front_too_long`.

## 3. Puertas

```text
pnpm check   exit 0 (format, lint, typecheck, contraste 18/18, vitest 37/262, build)
pnpm db:reset  8 migraciones + seed desde vacío, incluida
               20260910120000_import_error_codes_validation
pnpm db:test   12 ficheros / 311 aserciones, PASS (110: 45)
pnpm db:types  regenerado; git diff = las 6 líneas de los tres códigos nuevos
pnpm e2e       84 passed (22 ficheros; import-preview.spec.ts +2 casos)
```

**Verificación por rotura:** comentar el `ADD VALUE` de `front_too_long`,
`db:reset` + `db:test` → falla la aserción 5 de `110` (labels del enum:
tienen 6, quieren 7) y el `cast` aborta con `invalid input value for enum
import_error_code: "front_too_long"`. Restaurado; 311 PASS.

## 4. Archivos

| Archivo | Cambio |
|---|---|
| `src/modules/importing/domain/limits.ts` | Topes y `checkImportInput`. |
| `src/modules/importing/domain/filename.ts` | `sanitizeFilename`. |
| `src/modules/importing/domain/sanitize.ts` | `stripImportedHtml`, `sanitizeRowSample`. |
| `src/modules/importing/domain/row.ts` | Códigos de longitud + `classifyFields`. |
| `src/modules/importing/domain/column-mapping.ts` | Usa `classifyFields`. |
| `src/modules/importing/application/preview.ts` | `inspectImportUpload`, muestras. |
| `src/app/[locale]/(app)/import/actions.ts` | Tope por `File.size` antes de leer. |
| `next.config.ts` | `experimental.serverActions.bodySizeLimit: "6mb"`. |
| `supabase/migrations/20260910120000_import_error_codes_validation.sql` | `ADD VALUE`. |
| `docs/SECURITY.md` | Nuevo. |
| `docs/IMPORT_FORMAT.md`, `docs/DATA_MODEL.md` | Límites, códigos, fixture HTML. |
| `messages/{es,en}.json` | Errores y hint. |
| `tests/fixtures/import/html-tags.txt` | Fixture de HTML hostil. |

Migraciones: **1** (`20260910120000_import_error_codes_validation`).

## 5. Decisiones

- **Constantes propias del import**, no reutilizar
  `TITLE_MAX_LENGTH` (200) de biblioteca: un campo de Anki de 500
  caracteres es válido como frente de tarjeta y se rechazaría si se
  aplicara el tope de título aquí. LEX-4.7 aplicará los topes de cada
  entidad al crear. 4.000 coincide con `LONG_TEXT_MAX_LENGTH`.
- **HTML siempre**, no solo con `#html:true`: la directiva no es una
  señal de confianza.
- **Sin librería de sanitización HTML:** el objetivo es texto plano, no
  HTML seguro.
- **6 MB de cuerpo vs 5 MB de archivo:** el tope de Next.js mide el
  multipart entero; 6 MB deja holgura documentada en la guía de Server
  Actions de Next.js 16.

## 6. Riesgos y deuda

- Un archivo entre 6 MB y, p. ej., 50 MB lo rechaza Next.js con su
  error genérico, no con `too-large`. Aceptado: no se abre el cuerpo a
  tamaños ilimitados solo para mostrar un mensaje propio.
- El recuento previo de filas cuenta saltos de línea, incluidas
  directivas y sin distinguir campos entrecomillados multilínea. Es un
  techo barato, no el recuento exacto — documentado en `limits.ts`.
- Rate limiting de importación sigue fuera (FASE 4 posterior / FASE 8).

## 7. Siguiente

**LEX-4.6** — Clasificar duplicados en la importación. No empezada.
