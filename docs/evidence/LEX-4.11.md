# LEX-4.11 — Auditoría de seguridad, E2E y cierre de M4

**Fecha:** 2026-09-10
**Rama:** `feat/lex-4-11-m4-audit`
**Estado resultante:** `HECHO`. **Cierra FASE 4 / M4.** PR #67 fusionada a
`main` (merge `418ec0f`); CI verde en los tres trabajos, runs `34495775177`
(PR) y `34496371673` (merge).

---

## 1. Alcance

Mismo patrón que LEX-3.12 (cierre de M3) y LEX-2.11 (cierre de M2): **no
añade producto nuevo.** Recorre el gate 12.5 y los criterios de M4 sobre
LEX-4.1…4.10, cierra el hueco de aislamiento A/B que el lote nunca había
probado en la interfaz, y cubre inversa y el tope de filas en e2e.

**Sin migración.**

**Entregado:**

- `tests/e2e/import-isolation.spec.ts`: A importa un TSV; B no ve esos
  conceptos ni el mazo, ni por lista ni por UUID (`404` HTTP).
- e2e: inversa crea reconocimiento + recuperación del mismo concepto;
  >10.000 filas se rechazan sin previsualizar.
- Parser: entradas adversas no lanzan; `#notetype:Basic` se ignora.
- Hallazgo de auditoría **corregido:** `carried.rawRows` viaja en el
  cliente y `executeImport` no reaplicaba `MAX_ROWS`. Ahora sí, y no
  crea el trabajo.
- Este informe: tabla criterio → evidencia, deuda con veredicto, §3.6
  sigue abierta, relectura de `importing/`.

**Fuera de alcance:** publicar el dataset; cola asíncrona; timeout de
hosting (~110 s el lote de 1.016); huecos `____` como `cloze`; cuotas
de importación (gate 12.6 / FASE 8).

## 2. Criterio de salida de M4 → evidencia

> M4: **TXT/CSV con directivas Anki se previsualiza, mapea e importa con
> resumen fiable.** Excluye `.apkg` e IA. Evidencia: un fichero privado
> real y ~1.016 filas sin publicar datos. Cierre MASTER_SPEC hito 4:
> `A1_Pronunciacion.txt` u otro real se importa sin modificar el original
> ni publicar su contenido.

| Criterio | Dónde queda demostrado |
|---|---|
| **Parser TXT/CSV, directivas Anki** | `papaparse-delimited-file-parser.test.ts` (tab, coma, `;`, BOM, `#` posterior, HTML plano, errores, comillas TSV, adversarios). `directives.test.ts`. `IMPORT_FORMAT.md`. |
| **Wizard de mapeo y preview** | `import-preview.spec.ts` (separador, muestra, reasignar columnas, wizard foco/atrás). |
| **Límites 5 MB / 10.000 filas / campos** | Unit `limits.test.ts`. e2e: >5 MB; **>10.000 filas (nuevo)**; frente 4001. `execute-import.test.ts`: `MAX_ROWS+1` no crea trabajo. |
| **Nombre saneado, HTML no ejecutable** | `filename.test.ts`, `sanitize.test.ts`, e2e HTML plano. |
| **Duplicados no destructivos** | Unit `skip`/`copy`. e2e: concepto existente, intra-archivo, reimportar `skip` (0 creadas / 2 omitidas). `copy` ejecutado en unit, no en e2e. |
| **Lote + inversa** | Unit `createReverse` → 2 ítems. **e2e nuevo:** casilla, recap, reconocimiento + recuperación del mismo concepto. |
| **Resumen y errores** | e2e `errors.txt`: 1 creada · 3 fallidas · descarga `.txt`. |
| **Dataset real 1.016, originales intactos** | `docs/evidence/LEX-4.10.md`. Tests gated. SHA-256 intacto. |
| **RLS `import_jobs`** | pgTAP `110-import-jobs.sql`. |
| **Aislamiento A/B en la interfaz (lote)** | `import-isolation.spec.ts` (**nuevo**). |
| **Archivos privados fuera de Git** | Sin TXT reales en el repo. `LEXORA_PRIVATE_IMPORT_DIR`. |
| **Gate de arquitectura** | `layer-rules.test.ts` (papaparse restringido). `pnpm lint`. |
| **CI verde** | Cada PR de LEX-4.1…4.10 y esta. |

## 3. Gate 12.5

| Ítem | Veredicto |
|---|---|
| Tamaño, filas, longitud de campos | Cubierto. Filas también al **ejecutar** (hallazgo de esta tarea). |
| Encoding, BOM, separadores, comillas, directivas, inválidas | Cubierto. TSV vs RFC 4180 (LEX-4.10). |
| Nombre saneado; texto no confiable | Cubierto. |
| No se ejecuta HTML; fórmulas CSV no se interpretan | Cubierto. Neutralizar al **exportar** → FASE 8. |
| Preview no persiste antes de confirmar | Cubierto: sin `import_jobs` hasta `intent=execute`. |
| Duplicados explícitos, no destructivos por defecto | `skip` por defecto. Sin `update`. |
| Reintento / errores parciales | Trabajo nuevo; lote sigue tras un fallo de fila. |
| Privados fuera de Git/logs | Cubierto. |
| Rendimiento 1.016 y tope acordado | LEX-4.10: parseo ~22 ms; wizard ~110 s. 10.000 filas se rechazan. |

## 4. Deuda: qué sigue abierto

- **Timeout de Server Action en hosting** (LEX-4.10): ~110 s el lote de
  1.016. Local cabe. Un tope de ~10 s no. No se inventa cola aquí.
- **`copy` no tiene e2e de ejecución.** Unit sí. `skip` sí se ejecuta en
  e2e. No se promueve a tarea: no es un defecto de cara al usuario.
- **Huecos `____` como `basic_recognition`.** Producto, no de M4.
- **Cuotas de importación** — gate 12.6 / FASE 8. El tope 5 MB / 10.000
  filas no es una cuota por cuenta.
- **§3.6 sigue abierta** (sin segundo agente), arrastrada M2→M3→M4. No
  se declara resuelta. Ver LEX-3.12 §4.
- **LEX-3.13** pendiente (reinicio de formulario). No bloquea M4.
- **Q-005, Q-006** abiertas. No bloquean.
- **`PGRST303 JWT issued at future`** en logs e2e; los tests pasan.
- Deuda de `library/` de LEX-3.12 §5: sin cambios.

## 5. Revisión cruzada §3.6 — sigue abierta

Igual que en LEX-3.12: no hay segundo agente independiente. Se acepta
como riesgo conocido, no se cierra por escribirlo distinto.

## 6. Relectura de `importing/`

Ninguno bloquea M4 salvo el recuento al ejecutar, **corregido aquí**.

- **`carried.rawRows` es del cliente.** Preview aplica 5 MB / 10.000
  filas al archivo; confirmar reenviaba el JSON. Un `carried` hinchado
  saltaba el tope de filas (el de 6 MB del body seguía). `executeImport`
  y la acción vuelven a aplicar `MAX_ROWS` y no crean el trabajo.
- **`assertUserId` duplicada** en `duplicates.ts` y `execute-import.ts`,
  la misma de `library/application/` ×4 (LEX-3.12). No se unifica aquí.
- **El lote es N inserts** (concepto, ítem, enlace, tags por fila).
  Medido en LEX-4.10 (~108 ms/fila). Un insert por lote sería otra tarea.
- **El adaptador de `import_jobs` no tiene unit propio** (igual que los
  de biblioteca): lo cubren el caso de uso y pgTAP `110`.

## 7. Puertas

```text
pnpm check    exit 0 (format, lint, typecheck, contraste 18/18,
               vitest 44 ficheros / 285 passed / 1 skipped, build)
pnpm db:test  12 ficheros / 312 aserciones, PASS (sin cambios)
pnpm e2e      100 passed, 4 skipped (privados, sin env)
              +import-isolation; inversa; >10.000 filas
```

Migraciones: **0**.

## 8. Archivos

| Archivo | Cambio |
|---|---|
| `tests/e2e/import-isolation.spec.ts` | Nuevo. Aislamiento A/B del lote. |
| `tests/e2e/import-preview.spec.ts` | Inversa; >10.000 filas. |
| `execute-import.ts` + test | `MAX_ROWS` al ejecutar. |
| `actions.ts`, `preview.ts` | Recuento de `carried`. |
| Parser + `directives.test.ts` | Adversarios; `#notetype:Basic`. |
| `docs/SECURITY.md` | Barrera al ejecutar; texto de 4.7 al día. |
| `docs/evidence/LEX-4.11.md` | Este informe. |

## 9. Siguiente

**FASE 4 / M4 quedan cerradas** con LEX-4.1…4.11 `HECHO`. Siguiente:
**FASE 5 — LEX-5.1**. Etiqueta de hito M4 pendiente de autorización de
Joan, igual que M2 y M3.
