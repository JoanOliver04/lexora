# Lexora — protocolo de trabajo para agentes

Lexora es una aplicación web de aprendizaje adaptativo de inglés A1–B2 basada en
recuperación activa y repetición espaciada con FSRS.

Este archivo define **cómo** se trabaja aquí. El **qué** está en la
especificación y el roadmap. Léelo entero al empezar cada sesión.

> **El repositorio es público.** Todo lo que se confirma queda visible de forma
> permanente, también en los forks, aunque después se borre.

---

## 1. Antes de tocar nada

| Orden | Documento | Contiene |
|---|---|---|
| 1 | `docs/no_visible_en_github/MASTER_SPEC.md` | Producto, alcance y arquitectura. Fuente de verdad. **Local, no versionado.** |
| 2 | `docs/no_visible_en_github/ROADMAP.md` | Tareas `LEX-n.m`, dependencias, estados y quality gates. **Local, no versionado.** |
| 3 | `docs/STATUS.md` | Estado actual y siguiente acción exacta. |
| 4 | `docs/OPEN_QUESTIONS.md` | Decisiones pendientes del propietario (`Q-nnn`). |
| 5 | `docs/adrs/` | Los ADR relacionados con la tarea. |

Los dos primeros son privados a propósito, para que el diseño del producto no se
copie desde un repositorio público. **Si no existen en este clon, no inventes su
contenido: pídelos.**

Después: ejecuta `git status`, revisa si hay cambios que no has hecho tú, y no
los toques.

Antes de empezar, di en voz alta qué tarea vas a hacer, por qué está desbloqueada
y qué archivos esperas tocar.

---

## 2. Ciclo obligatorio de cada tarea

1. Marca **esa** tarea como `EN PROCESO` en el roadmap. Solo una a la vez.
2. Trabaja en una rama reconocible: `feat/lex-4-2-delimited-parser`.
3. **Lee el código existente antes de escribir.** Incluidos sus tests.
4. Implementa solo el alcance declarado. Nada más.
5. Escribe o actualiza los tests junto al cambio, no después.
6. Ejecuta el gate general y los gates específicos que apliquen (roadmap §12).
7. Revisa el diff **completo**: lockfile, SQL y archivos generados incluidos.
8. Corrige lo que encuentres antes de seguir.
9. Actualiza documentación, `docs/STATUS.md` y la evidencia.
10. Marca `HECHO` solo con todo en verde.
11. Indica la siguiente tarea desbloqueada. **No la empieces.**

### Los tres estados

`PENDIENTE` · `EN PROCESO` · `HECHO`. No existen `BLOQUEADO`, `CASI HECHO` ni
`EN REVISIÓN`. Un bloqueo se anota como `Q-nnn`, no como estado.

### Qué cuenta como evidencia

Salida real de comandos. Resultado de tests de base de datos con caso dueño y
caso no-dueño. Un identificador de commit o de ejecución de CI. Una migración
reaplicada desde una base limpia. Un archivo importado con su recuento.

No cuenta: «parece funcionar», «el build debería pasar», «lo he revisado».

---

## 3. Informe al terminar

Siempre, y en este orden:

- ID de la tarea y resultado.
- Archivos creados o modificados.
- Migraciones añadidas.
- Decisiones tomadas y ADR afectados.
- Comandos ejecutados **y su resultado real**.
- Comprobaciones manuales que quedan para el propietario.
- Riesgos, deuda o límites conocidos.
- Estado del árbol Git.
- Siguiente tarea recomendada.

---

## 4. Cuándo detenerte y preguntar

Detén **solo la tarea afectada** y registra un `Q-nnn` en
`docs/OPEN_QUESTIONS.md` con contexto, opciones, recomendación e impacto cuando:

- haya dos interpretaciones que cambien la experiencia del usuario;
- la decisión implique coste recurrente, proveedor o plan de pago;
- haya que publicar, desplegar o abrir registros públicos;
- falte una credencial;
- se vaya a borrar, anonimizar o migrar información real;
- dos documentos normativos se contradigan;
- la solución exija ampliar el stack o el alcance;
- haya implicaciones legales, de privacidad, licencia o marca;
- una prueba solo pueda hacerla el propietario en su cuenta o su dispositivo.

Registra la pregunta y sigue con lo que no dependa de ella.

---

## 5. Reglas innegociables

**Proceso**

- Nunca avances dos tareas sin autorización expresa.
- Nunca marques `HECHO` sin evidencia ejecutada.
- Nunca resuelvas en silencio una decisión de producto pendiente.
- Nunca amplíes el alcance de la V1 con una función de una versión posterior.
- Nunca toques cambios ajenos que ya estuvieran en el árbol de trabajo.

**Arquitectura** — detalle en `docs/ARCHITECTURE.md`

- `domain` no importa React, Next.js, Supabase, Vercel ni `ts-fsrs`.
- Las reglas de negocio no viven en componentes, Server Actions ni Route Handlers.
- `ts-fsrs` solo se usa detrás del puerto `SpacedRepetitionScheduler`.
- No reimplementes la matemática de FSRS.
- No confíes en el reloj del navegador para vencimientos: el reloj se inyecta.

**Datos y seguridad**

- Toda tabla expuesta lleva RLS con políticas explícitas, y se prueba.
- Todo cambio de esquema va en una migración SQL versionada.
- Nunca `service_role` en el navegador. Nunca secretos en el repositorio.
- Nunca desactives tests, RLS o TypeScript estricto para conseguir un build verde.
- Nunca introduzcas `any` para esquivar un error de tipos.
- Nunca uses el material privado del propietario como fixture público o seed.
- Nunca copies contenido de `docs/no_visible_en_github/` a un archivo versionado.

**Entorno de esta máquina**

- **No edites archivos con texto en español usando `Get-Content`/`Set-Content` de PowerShell.** Windows PowerShell 5.1 lee UTF-8 sin BOM como ANSI y corrompe los acentos al reescribir. Usa las herramientas de edición de ficheros.
- Node y pnpm se resuelven a través de nvm-windows. Una terminal que devuelva una versión distinta de la fijada en `.nvmrc` necesita `nvm use`.

**Operaciones**

- Nunca publiques, despliegues a producción ni apliques una migración destructiva sin autorización explícita.
- Nunca añadas una dependencia grande sin justificar su coste.
- Nunca digas que algo está probado sin haber ejecutado la verificación.

---

## 6. Definition of Done

```text
entregable real
+ criterios de aceptación de la tarea
+ gate general
+ gates específicos aplicables
+ tests ejecutados
+ documentación actualizada
+ evidencia registrada
+ árbol de trabajo conocido y seguro
= HECHO
```

Si falta cualquiera de esos componentes, la tarea sigue `EN PROCESO`.

---

## 7. Prioridad y pausa

Expyria conserva la prioridad estratégica sobre este proyecto. Cuando el
propietario comunique que `DEV-5.13` está desbloqueado:

1. No empieces ninguna tarea nueva de Lexora.
2. Termina la operación atómica en curso, o déjala revertida de forma segura.
3. No dejes una migración a medias ni fusiones una rama incompleta.
4. Si la tarea no cumple su Definition of Done, déjala `EN PROCESO`.
5. Actualiza `docs/STATUS.md` con: tarea e intención, rama y commit base,
   archivos tocados, qué está hecho, qué falta, tests ejecutados y su resultado,
   tests todavía necesarios, migraciones afectadas y **la siguiente acción exacta**.
6. Registra los bloqueos como `Q-nnn`.
7. Deja `git status` conocido. Nada destructivo para «limpiar».
8. Vuelve a Expyria.

El criterio: cualquiera debe poder retomar Lexora leyendo `docs/STATUS.md`, sin
reconstruir la conversación.

---

## 8. Bloque gestionado por Next.js

Lo que sigue lo escribe y lo vuelve a añadir `next dev` por su cuenta. No se edita
a mano: borrarlo solo consigue que reaparezca y deje el árbol sucio. Su aviso es
pertinente, porque Next.js 16 trae cambios que rompen respecto a versiones
anteriores y la documentación exacta de la versión instalada vive dentro del
propio paquete.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
