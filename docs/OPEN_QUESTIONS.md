# Lexora — Preguntas abiertas

> Registro de decisiones que un agente **no** debe resolver por su cuenta.
> Cada entrada tiene un ID estable `Q-nnn` que nunca se reutiliza.
> Protocolo: `ROADMAP.md` §3.5 (documento privado y local).

**Última actualización:** 2026-09-02

## Índice de estado

| ID | Título | Estado | Tareas afectadas |
|---|---|---|---|
| Q-001 | Visibilidad de `CLAUDE.md` | `RESUELTA` | LEX-0.3 |
| Q-002 | Qué documentación es pública y cuál no | `RESUELTA` | LEX-0.2, LEX-0.4, LEX-0.5, LEX-10.4 |
| Q-003 | Herramientas de desarrollo ausentes | `RESUELTA` | — |
| Q-004 | Primer push al remoto público | `RESUELTA` | — |
| Q-005 | «Profesional» en un mazo: ¿nivel o categoría? | `ABIERTA` | LEX-3.1, LEX-3.2, LEX-3.5 |

> Este archivo es público. Se aplican las mismas exclusiones que en
> [`STATUS.md`](STATUS.md): sin credenciales, sin datos personales, sin contenido
> copiado de los documentos privados y sin detalle de tareas futuras del roadmap.

---

## Q-001 — Visibilidad de `CLAUDE.md`

**Estado:** `RESUELTA`
**Abierta:** 2026-08-26 · **Resuelta:** 2026-08-26 por Joan.

### Contexto

Inicialmente se pidió excluir `CLAUDE.md` del repositorio, lo que contradecía
`MASTER_SPEC.md` §22 y la tarea LEX-0.3, que lo exigen versionado como archivo
operativo del proyecto.

### Resolución

`CLAUDE.md` **se versiona y es público**. Contiene protocolo de trabajo, no
secretos ni contenido del producto, y su ausencia rompería el criterio de cierre
de LEX-1.14 («un clon limpio permite retomar el trabajo»). Se ha reescrito para
que no reproduzca contenido de los documentos privados: describe el método, no el
diseño.

### Consecuencia

LEX-0.3 sigue `PENDIENTE`, pero ya sin ambigüedad: su entregable es un
`CLAUDE.md` versionado y completo. El archivo actual es una versión mínima
funcional que esa tarea debe ampliar.

---

## Q-002 — Qué documentación es pública y cuál no

**Estado:** `RESUELTA`
**Abierta:** 2026-08-26 · **Resuelta:** 2026-08-26 por Joan.

### Contexto

El repositorio de GitHub es **público**. Joan quiere evitar que el diseño completo
del producto se copie, pero mantener el valor de portfolio del proyecto.
`MASTER_SPEC.md` §22 pedía toda la documentación versionada.

### Resolución

Criterio: **es privado el diseño; es público el método.**

| Privado — `docs/no_visible_en_github/` | Público — versionado |
|---|---|
| `MASTER_SPEC.md` | `README.md` |
| `ROADMAP.md` | `CLAUDE.md` |
| Material privado de Anki (TXT de Joan) | `docs/STATUS.md` |
| `.env` y cualquier credencial | `docs/OPEN_QUESTIONS.md` |
| | `docs/adrs/` |
| | `docs/evidence/` |
| | `docs/ARCHITECTURE.md`, `DATA_MODEL.md`, `FSRS.md` (LEX-0.5) |

Los ADR y las specs técnicas de LEX-0.5 **son públicos**: demuestran criterio
técnico sin entregar el plan de producto. Al redactarlos, describir decisiones y
sus razones, no copiar secciones de `MASTER_SPEC.md`.

### Riesgos aceptados

1. **Un commit accidental es permanente.** En un repositorio público, cualquier
   archivo confirmado una sola vez queda en el historial y en los forks aunque se
   borre después. Verificar `git status` antes de cada commit.
2. `MASTER_SPEC.md` y `ROADMAP.md` quedan **fuera de Git**: sin historial, sin
   copia de seguridad y sin revisión por PR. Debe existir una copia fuera del
   proyecto.
3. Los documentos públicos enlazan a los privados con rutas que no resolverán en
   un clon ajeno. Es aceptable y está señalado en cada enlace.

---

## Q-003 — Herramientas de desarrollo ausentes

**Estado:** `RESUELTA`
**Abierta:** 2026-08-26 · **Resuelta:** 2026-08-27.

### Resolución

| Herramienta | Estado final |
|---|---|
| Node.js | 24.19.0, con nvm-windows |
| pnpm | 11.24.0, vía corepack |
| npm | 11.17.0 |
| Docker Desktop | **4.88.1**, motor 29.7.2 operativo |
| CLI de Supabase | 2.116.0, como dependencia del proyecto |

### El bloqueo de Docker no era configuración

Docker Desktop estaba en la **4.18.0, de marzo de 2023**, sobre un WSL 2.7.8 con
kernel 6.18 de 2026. `dockerd` moría al instante y su registro solo contenía
`EOF`: ni una línea de error, que es la firma de una incompatibilidad de binarios
y no de un ajuste mal puesto.

Actualizado por el propietario a 4.88.1. El motor arranca en unos 30 segundos.

Otra pista que lo confirmaba: existía la distribución `docker-desktop-data`, que
Docker eliminó hace años y solo sobrevive en instalaciones antiguas.

### Decisión sobre la CLI de Supabase

Dependencia de desarrollo del proyecto, no instalación global con Scoop. La
versión queda en el lockfile, un clon limpio obtiene la misma sin instalar nada, y
la máquina no necesita otro gestor de paquetes. Se invoca como
`pnpm exec supabase` o mediante los scripts `db:*`.

---

## Q-004 — Primer push al remoto público

**Estado:** `RESUELTA`
**Abierta:** 2026-08-26 · **Resuelta:** 2026-08-27 por Joan.

### Resolución

Autorizado. `main` y la etiqueta `v0.1.0-m0` publicadas en
`https://github.com/JoanOliver04/lexora`: 33 commits, 89 ficheros.

### Comprobación previa a publicar

Un repositorio público conserva el historial de forma permanente, también en los
forks, así que la comprobación se hizo antes y no después:

| Comprobación | Resultado |
|---|---|
| Remoto existe y está vacío | Sí; sin divergencia que resolver |
| Ficheros versionados | 89, auditados por carpeta |
| `.env.example` con valores reales | No; solo `localhost` y `127.0.0.1` |
| Claves conocidas en **todo** el historial | Limpio |
| `docs/no_visible_en_github/` | Fuera, como estaba previsto |

Una coincidencia que hubo que descartar: `sb_secret_` aparece en el historial. Es
el texto de aviso de `.env.example` —«la clave secreta (`sb_secret_…`) NO se
define aquí»— con puntos suspensivos, no una clave. Se verificó antes de seguir,
en lugar de suponerlo.

### Consecuencia

Desbloquea LEX-1.12: una CI solo se puede dar por buena viéndola correr.

---

## Q-005 — «Profesional» en un mazo: ¿nivel o categoría?

**Estado:** `ABIERTA`
**Fecha:** 2026-09-02
**Bloquea:** ya no bloquea LEX-3.2 (se aplicó la opción 1, reversible); sigue
condicionando la interfaz de creación de mazos en LEX-3.5 y una eventual
migración correctora si Joan elige otra opción.

### Contexto

`MASTER_SPEC.md` §9.5 ofrece «profesional» en **dos** listas del formulario de
mazo: la de **nivel MCER** («A1, A2, B1, B2 o profesional») y la de **categoría**
(«vocabulario, gramática, función comunicativa, pronunciación, profesional o
mixta»). §13.6 nombra la columna `cefr_level`, cuyo nombre implica solo bandas
del Marco Común (A1–B2), como el enum `public.cefr_level` que ya existe (LEX-2.1)
y que comparten `courses.declared_level` / `start_level`.

Si «profesional» es un valor de nivel, `decks` necesita un enum propio distinto
del de cursos, y «nivel» deja de significar lo mismo en toda la app.

### Opciones

1. **`professional` es una categoría, no un nivel.** `decks.cefr_level` reutiliza
   el enum `public.cefr_level` (A1–B2, anulable); el contenido profesional se
   marca con `category = 'professional'` y `cefr_level` nulo.
2. **`professional` es un valor de nivel.** `decks` usa un enum nuevo
   (`cefr_level` + `professional`), separado del de cursos. «Nivel» pasa a tener
   dos significados según la tabla.
3. Un tercer eje explícito (`is_professional boolean`), que nadie ha pedido.

### Recomendación

Opción 1. Mantiene un único significado de «nivel MCER» en cursos y biblioteca,
reutiliza el enum existente y no pierde información: la categoría ya recoge
«profesional». LEX-3.1 ya modela el dominio así (`DeckCategory` incluye
`professional`; `deck.cefrLevel: CefrLevel | null`).

### Impacto de no decidir

LEX-3.1 (dominio) y LEX-3.2 (migración `20260902193649_library_schema`) se
entregan con la opción 1: `deck_category` incluye `professional` y
`decks.cefr_level` reutiliza `public.cefr_level`. Si Joan elige la opción 2,
hace falta: cambiar `deck_category` en `taxonomy.ts`, una migración correctora
que cree un enum nuevo para `decks.cefr_level` y migre las filas, y ajustar la
interfaz de LEX-3.5. Cuanto más contenido real exista, más cara es la
corrección — conviene decidir antes de LEX-3.5.

### Resolución

_(pendiente)_

---

## Plantilla para nuevas entradas

```text
## Q-nnn — Título

**Estado:** ABIERTA | RESUELTA | RETIRADA
**Fecha:**
**Bloquea:**

### Contexto
### Opciones
### Recomendación
### Impacto de no decidir
### Resolución (fecha, quién decide, decisión, documentos actualizados)
```
