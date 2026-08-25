# LEX-0.8 — Auditoría de M0 y primer checkpoint

**Fecha:** 2026-08-26
**Rama:** `main`
**Estado resultante:** M0 `HECHO`, con una excepción registrada.

---

## 1. Enlaces internos

Comprobación automática de todos los enlaces relativos de los 18 documentos
Markdown del proyecto, versionados y locales.

**Primera pasada — 4 enlaces rotos**, todos originados al mover documentos entre
`docs/` y `docs/no_visible_en_github/`:

| Documento | Enlace | Problema |
|---|---|---|
| `docs/evidence/README.md` | `../ROADMAP.md` | El roadmap ya no está en `docs/` |
| `docs/no_visible_en_github/ROADMAP.md` | `OPEN_QUESTIONS.md` | El documento se publicó en `docs/` |
| `docs/no_visible_en_github/ROADMAP.md` | `STATUS.md` (×2) | Íd. |

Corregidos. `docs/evidence/README.md` tenía además una ruta obsoleta en su
convención de nombres.

**Segunda pasada:** 43 enlaces relativos, **0 rotos**.

## 2. Contenido publicado y limpieza del historial

`git ls-files` — 19 archivos versionados:

```text
.gitattributes  .gitignore  .nvmrc  CLAUDE.md  README.md
docs/ARCHITECTURE.md  docs/CONTENT_POLICY.md  docs/DATA_MODEL.md
docs/FSRS.md  docs/GLOSSARY.md  docs/OPEN_QUESTIONS.md
docs/STATUS.md  docs/WORKFLOW.md  docs/evidence/README.md
docs/adrs/README.md  docs/adrs/ADR-001…ADR-004
```

**Historial completo revisado**, no solo el árbol actual: todo archivo añadido en
cualquier commit desde el primero. Ni la especificación, ni el roadmap, ni
material privado han estado versionados **en ningún momento**. La comprobación
importa porque el repositorio es público y un archivo confirmado una sola vez
permanece en el historial y en los forks.

Búsqueda de patrones de credenciales en todo el historial: sin hallazgos. Las
únicas coincidencias son el encabezado de sección «Entorno y secretos» del
`.gitignore`.

Exclusiones verificadas con `git check-ignore -v`: `docs/no_visible_en_github/`
queda fuera en todos sus contenidos.

## 3. Coherencia entre documentos

| Comprobación | Resultado |
|---|---|
| Terminología del dominio entre `GLOSSARY.md` y `DATA_MODEL.md` | Coherente. `Card` aparece solo como término de interfaz. |
| Modos de práctica activos en V1 | Los mismos tres en el glosario y en la especificación. |
| Versión de Node entre la especificación y `WORKFLOW.md` | **Sin contradicción.** La especificación pide una LTS activa compatible con Vercel, mínimo Node 20; Node 24 es la LTS activa y el default de Vercel. |
| Frontera público/privado | Desviación consciente respecto a la especificación, registrada en Q-002 y en el registro de cambios del roadmap. |
| Estados de tarea | Solo `PENDIENTE`, `EN PROCESO` y `HECHO` en todos los documentos. |

## 4. Entregables de M0

| Tarea | Estado | Entregable |
|---|---|---|
| LEX-0.1 | `HECHO` | Repositorio inicializado, entorno inventariado, `STATUS.md` |
| LEX-0.2 | `HECHO` | Documentación integrada, frontera público/privado |
| LEX-0.3 | `HECHO` | `CLAUDE.md` operativo |
| LEX-0.4 | `HECHO` | ADR-001…004 |
| LEX-0.5 | `HECHO` | `ARCHITECTURE.md`, `DATA_MODEL.md`, `FSRS.md` |
| LEX-0.6 | `HECHO` | `WORKFLOW.md`, `.nvmrc`, `.gitattributes` |
| LEX-0.7 | `HECHO` | `GLOSSARY.md`, `CONTENT_POLICY.md` |
| LEX-0.8 | `HECHO` | Esta auditoría y la etiqueta `v0.1.0-m0` |

**Criterio de cierre de M0** —no quedan contradicciones sobre el alcance mínimo,
la unidad que programa la repetición espaciada ni la propiedad de los datos—:
cumplido. Las tres cuestiones están resueltas y documentadas en ADR-003,
`DATA_MODEL.md` y `CONTENT_POLICY.md`.

## 5. Excepción registrada

El roadmap recomienda una revisión cruzada independiente de las áreas críticas.
**No se ha realizado.** M0 no contiene código, migraciones ni políticas de acceso,
así que el riesgo es bajo, pero la excepción queda visible en lugar de darse por
hecha. La primera revisión cruzada que sí es exigible corresponde al modelo de
datos, en la fase 2.

## 6. Comprobaciones no aplicables

Los gates de lint, tipos, tests y build no se ejecutan: no existe `package.json`.
Primera ejecución posible, en la fase 1.

## 7. Checkpoint

Etiqueta local **`v0.1.0-m0`**.

**Sin `push`.** El remoto sigue sin contactar; la autorización es Q-004 y
corresponde al propietario. El repositorio de GitHub es público, así que publicar
es una acción irreversible en la práctica.

## 8. Estado al cerrar

- FASE 0 completa, 8 de 8 tareas.
- FASE 1 bloqueada por Q-003: faltan Node 24.19.0, pnpm 11.24.0 y la CLI de
  Supabase, y el daemon de contenedores no responde.
