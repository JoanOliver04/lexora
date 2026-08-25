# Lexora — Preguntas abiertas

> Registro de decisiones que un agente **no** debe resolver por su cuenta.
> Cada entrada tiene un ID estable `Q-nnn` que nunca se reutiliza.
> Protocolo: `ROADMAP.md` §3.5 (documento privado y local).

**Última actualización:** 2026-08-26

## Índice de estado

| ID | Título | Estado | Tareas afectadas |
|---|---|---|---|
| Q-001 | Visibilidad de `CLAUDE.md` | `RESUELTA` | LEX-0.3 |
| Q-002 | Qué documentación es pública y cuál no | `RESUELTA` | LEX-0.2, LEX-0.4, LEX-0.5, LEX-10.4 |
| Q-003 | Herramientas de desarrollo ausentes | `ABIERTA` | LEX-1.1, LEX-1.7 |
| Q-004 | Primer push al remoto público | `ABIERTA` | LEX-0.8 |

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

**Estado:** `ABIERTA`
**Fecha:** 2026-08-26
**Bloquea:** LEX-1.1, LEX-1.7.

### Contexto

Inspección del entorno realizada en LEX-0.1:

| Herramienta | Estado |
|---|---|
| Git 2.39.0 | Presente |
| Node.js v22.22.2 | Presente, cumple el mínimo Node 20 |
| npm 10.9.7 | Presente |
| corepack 0.34.6 | Presente |
| pnpm | **Ausente** |
| Docker CLI 20.10.24 | Presente |
| Docker daemon | **No responde** |
| Supabase CLI | **Ausente** |

El stack aprobado fija pnpm como gestor de paquetes y Supabase CLI + Docker para
base de datos local, migraciones, seeds y pgTAP.

### Acciones necesarias antes de FASE 1

1. Activar pnpm: `corepack enable pnpm`. Decidir la versión exacta para `packageManager`.
2. Arrancar Docker Desktop y verificar que `docker info` responde.
3. Instalar Supabase CLI y fijar su versión.

### Recomendación

Que las ejecute Joan y confirme las versiones resultantes. Son instalaciones
globales en su máquina, no decisiones de arquitectura, y un agente no debe
instalarlas sin autorización.

---

## Q-004 — Primer push al remoto público

**Estado:** `ABIERTA`
**Fecha:** 2026-08-26
**Bloquea:** LEX-0.8.

### Contexto

Remoto configurado: `https://github.com/JoanOliver04/lexora.git`, **público**.
Nunca contactado: no se ha ejecutado `push`, `fetch` ni `ls-remote`.

Con el `.gitignore` actual, un push publicaría únicamente `.gitignore`,
`README.md`, `CLAUDE.md`, `docs/STATUS.md`, `docs/OPEN_QUESTIONS.md`,
`docs/evidence/README.md` y `docs/adrs/.gitkeep`.

### Preguntas

1. ¿Se autoriza `git push -u origin main`?
2. ¿El repositorio remoto está vacío, o tiene commits que obligarían a resolver una divergencia?
3. Al ser público desde el primer día: ¿se acepta que todo el historial futuro sea
   permanentemente visible, incluidos los commits de trabajo en curso?

### Recomendación

Autorizar el push. El contenido actual es correcto para un repositorio público y
no contiene datos privados. Antes de cada push posterior, comprobar
`git ls-files` para confirmar que no se ha colado nada de la carpeta privada.

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
