# Lexora — Estado actual

**Última actualización:** 2026-08-26
**Fase actual:** FASE 0 — Gobierno, documentación y repositorio — `HECHO` (8/8)
**Hito actual:** M0 — Gobierno del proyecto operativo — `HECHO`. Siguiente: M1 — Fundación técnica.
**Tarea activa:** ninguna
**Estado de la tarea:** LEX-0.1 `HECHO` · LEX-0.2 `HECHO` · LEX-0.4 `HECHO` · LEX-0.5 `HECHO` · LEX-0.3 `HECHO` · LEX-0.6 `HECHO` · LEX-0.7 `HECHO` · LEX-0.8 `HECHO`
**Rama / commit base / HEAD:** `main` / `8d45f29` / ver «Estado de git»

> El roadmap detallado y la especificación maestra son documentos privados y
> locales; no forman parte de este repositorio público. Ver
> [`OPEN_QUESTIONS.md`](OPEN_QUESTIONS.md) Q-002.

---

## Terminado en esta sesión

### LEX-0.1 — Inspeccionar e inicializar de forma segura el repositorio local — `HECHO`

- Inventario del árbol previo realizado sin sobrescribir ningún archivo.
- Repositorio Git inicializado con rama `main`.
- Remoto `origin` configurado por autorización expresa de Joan; todavía no contactado.
- Versiones de herramientas comprobadas (tabla más abajo).
- `docs/STATUS.md` creado.
- No se ha ejecutado `create-next-app`, no se han instalado dependencias y no se ha creado ningún servicio externo.

### LEX-0.2 — Integrar la documentación canónica — `HECHO`

- Creados `docs/STATUS.md`, `docs/OPEN_QUESTIONS.md`, `docs/evidence/README.md`, `docs/adrs/` y `README.md`.
- Reescrito `CLAUDE.md` como protocolo operativo versionado.
- Definida la frontera público/privado: **es privado el diseño, es público el método** (Q-002).
- `.gitignore` ampliado para un repositorio público: secretos, entorno, artefactos de build y test.

### LEX-0.4 — Crear ADR-001…004 — `HECHO`

- Cuatro Architecture Decision Records creados en `docs/adrs/`, más un índice con el formato y las reglas de sustitución.
- Cada ADR incluye contexto, decisión, alternativas descartadas con su motivo, consecuencias aceptadas, forma de verificación y condiciones para reabrirlo.
- Redactados desde las decisiones, sin reproducir secciones de la especificación privada.

| ADR | Decisión |
|---|---|
| ADR-001 | Monolito modular con Clean Architecture pragmática y organización feature-first. |
| ADR-002 | Supabase Data API con migraciones SQL, tipos generados y repositorios propios; sin ORM. |
| ADR-003 | El estado de memoria pertenece a (usuario, `PracticeItem`), no al `Concept` ni a la variante visual. |
| ADR-004 | PWA instalable y online-first; sin cola offline ni resolución de conflictos en la V1. |

### LEX-0.5 — Esqueletos de `ARCHITECTURE.md`, `DATA_MODEL.md` y `FSRS.md` — `HECHO`

- `docs/ARCHITECTURE.md` — capas y regla de dependencia, módulos de negocio, estructura de carpetas, puertos, criterio de Server/Client Components, seguridad en dos barreras y niveles de test.
- `docs/DATA_MODEL.md` — entidades, diagrama de relaciones, convenciones del esquema y en qué fase aparece cada tabla.
- `docs/FSRS.md` — puerto y adaptador, versionado de configuración, cola diaria, transacción de repaso con idempotencia y concurrencia, y política de tiempo.
- Los tres enlazan a los ADR correspondientes y marcan explícitamente sus secciones pendientes.
- Enlazados desde `README.md`.

**Pendiente en ellos, por diseño:** columnas exactas del esquema (llegan con cada migración), valores de configuración del planificador (fase 5) y política de índices (cuando existan consultas que medir).

### LEX-0.3 — `CLAUDE.md` operativo completo — `HECHO`

Ampliado de una versión mínima al protocolo completo, en siete secciones: orden
de lectura obligatorio, ciclo por tarea con los tres estados y qué cuenta como
evidencia, formato del informe de cierre, criterios para detenerse y abrir un
`Q-nnn`, reglas innegociables agrupadas por proceso / arquitectura / datos y
seguridad / operaciones, Definition of Done, y protocolo de pausa hacia Expyria.

Remite a la especificación y al roadmap en lugar de reproducirlos, y advierte de
que ambos son locales y no versionados. Un agente sin contexto previo puede
seguirlo para saber **cómo** trabajar aunque no tenga los documentos privados.

### LEX-0.6 — Workflow, versionado y política de entornos — `HECHO`

`docs/WORKFLOW.md` creado, con `.nvmrc` fijando la versión local de Node.

**Versiones fijadas**, comprobadas contra la documentación oficial el 2026-08-26:

| Herramienta | Versión | Motivo |
|---|---|---|
| Node.js | 24.19.0 (`24.x`) | La spec pide una LTS activa compatible con Vercel, mínimo Node 20. Node 24 es la LTS activa y el default de Vercel: la cumple. Node 20 llegó a fin de vida en abril de 2026; Node 22 está en mantenimiento. |
| pnpm | 11.24.0 | Última estable. Se activará con `corepack enable pnpm`. |

Fuentes consultadas: índice de distribuciones de Node.js y la página de versiones
soportadas de Vercel, que ofrece 24.x (por defecto), 22.x y 20.x.

**Otras decisiones:** ramas `<tipo>/lex-<fase>-<tarea>-<slug>`; Conventional
Commits con el ID de tarea como ámbito; commits y comentarios de código en
inglés, documentación en español; migraciones SQL versionadas sin excepción;
tres entornos con variables separadas y la regla de que ninguna preview apunta a
datos de producción; procedimiento escrito para emergencias en producción;
SemVer con `0.x` hasta la V1.

> **Consecuencia para Q-003:** la máquina tiene Node v22.22.2. Hay que instalar
> Node 24.19.0 antes de la fase 1.

### LEX-0.7 — Nomenclatura y política de contenido — `HECHO`

`docs/GLOSSARY.md` — un término, un significado, en dominio, esquema, interfaz y
documentación. Fija que **`Card` no es una entidad**: es el término que ve el
usuario, mientras el modelo usa `PracticeItem`. Incluye la tabla de equivalencias
interfaz/modelo, los cuatro conceptos de idioma separados, convenciones de nombres
para base de datos, TypeScript, ficheros, modos de práctica, estados y
valoraciones, y qué idioma se usa en cada capa del proyecto.

`docs/CONTENT_POLICY.md` — qué puede vivir en un repositorio público. El material
privado de estudio se importa en la cuenta del propietario y nunca se versiona,
ni como fixture ni como semilla, por privacidad y porque parte procede de fuentes
de terceros. Las fixtures de test son originales y cubren la forma del archivo,
no el idioma. Lista de prohibiciones, comprobación previa a cada commit y qué
hacer si algo privado llega a confirmarse.

También añadido `.gitattributes`: normaliza los finales de línea a LF. Sin él, un
checkout en Windows convierte a CRLF y `.nvmrc`, los scripts de shell y las
migraciones SQL fallan al ejecutarse en la CI sobre Linux.

### LEX-0.8 — Auditoría de M0 y primer checkpoint — `HECHO`

Informe completo en [`evidence/LEX-0.8.md`](evidence/LEX-0.8.md). Resumen:

- **Enlaces:** 4 rotos encontrados y corregidos, todos por el movimiento de documentos entre `docs/` y la carpeta privada. Segunda pasada: 43 enlaces, 0 rotos.
- **Historial:** revisado por completo, no solo el árbol actual. Ni la especificación, ni el roadmap, ni material privado han estado versionados en ningún commit. Sin credenciales.
- **Coherencia:** terminología, modos de práctica y estados de tarea consistentes entre documentos. La versión de Node **no** contradice la especificación: pedía una LTS activa compatible con Vercel, y Node 24 lo es.
- **Excepción registrada:** no se ha hecho revisión cruzada independiente. M0 no contiene código ni políticas de acceso, pero la excepción queda visible en lugar de fingirse.
- **Checkpoint:** etiqueta local `v0.1.0-m0`. Sin `push`: sigue siendo Q-004.

### Frontera público / privado

| Contenido | Ubicación | ¿En Git? |
|---|---|---|
| Especificación maestra | `docs/no_visible_en_github/MASTER_SPEC.md` | **No** |
| Roadmap detallado | `docs/no_visible_en_github/ROADMAP.md` | **No** |
| Material privado de Anki | `docs/no_visible_en_github/` | **No** |
| Estado y preguntas abiertas | `docs/STATUS.md`, `docs/OPEN_QUESTIONS.md` | Sí |
| ADR y evidencia | `docs/adrs/`, `docs/evidence/` | Sí |
| Protocolo del agente | `CLAUDE.md` | Sí |
| Presentación del proyecto | `README.md` | Sí |

---

## Trabajo todavía abierto

| Tarea | Estado | Nota |
|---|---|---|
| LEX-0.3 — `CLAUDE.md` operativo completo | `PENDIENTE` | Desbloqueada por Q-001. Existe una versión mínima que ampliar. |
| LEX-0.4 — ADR-001…004 | `PENDIENTE` | Desbloqueada por Q-002: los ADR son públicos. |
| LEX-0.5 — `ARCHITECTURE.md`, `DATA_MODEL.md`, `FSRS.md` | `PENDIENTE` | Desbloqueada por Q-002: públicos. |
| LEX-0.6 — Workflow, versionado y entornos | `PENDIENTE` | Sin dependencias abiertas. |
| LEX-0.7 — Nomenclatura y política de contenido | `PENDIENTE` | Sin dependencias abiertas. |
| LEX-0.8 — Auditar M0 y checkpoint versionado | `PENDIENTE` | Depende de Q-004 (push). |

---

## Archivos y migraciones afectados

| Archivo | Cambio |
|---|---|
| `.gitignore` | Reescrito para repositorio público. |
| `README.md` | Creado. Presentación, modelo conceptual, stack y alcance. |
| `CLAUDE.md` | Ampliado al protocolo operativo completo. |
| `docs/STATUS.md` | Creado. |
| `docs/OPEN_QUESTIONS.md` | Creado. Q-001…Q-004. |
| `docs/evidence/README.md` | Creado. Convención `LEX-n.m.md`. |
| `docs/adrs/README.md` | Creado. Índice, formato y reglas de los ADR. |
| `docs/adrs/ADR-001…004` | Creados. Decisiones estructurales de la V1. |
| `docs/ARCHITECTURE.md` | Creado. |
| `docs/DATA_MODEL.md` | Creado. |
| `docs/FSRS.md` | Creado. |
| `docs/WORKFLOW.md` | Creado. |
| `.nvmrc` | Creado. Fija Node 24.19.0 en local. |
| `.gitattributes` | Creado. Normaliza finales de línea a LF. |
| `docs/GLOSSARY.md` | Creado. |
| `docs/CONTENT_POLICY.md` | Creado. |
| `docs/evidence/LEX-0.8.md` | Creado. Informe de auditoría de M0. |
| `README.md` | Actualizado: enlaces a las tres specs técnicas. |
| `docs/no_visible_en_github/` | Reservado para `MASTER_SPEC.md`, `ROADMAP.md` y material privado. |

Migraciones SQL: ninguna. Todavía no existe base de datos.

---

## Verificaciones ejecutadas y resultados

### Entorno de desarrollo

| Herramienta | Estado | Versión |
|---|---|---|
| Git | Presente | 2.39.0.windows.2 |
| Node.js | Presente | v22.22.2 (LTS activa; cumple el mínimo Node 20) |
| npm | Presente | 10.9.7 |
| corepack | Presente | 0.34.6 |
| pnpm | **Ausente** | — (activable con `corepack enable pnpm`) |
| Docker CLI | Presente | 20.10.24 |
| Docker daemon | **No responde** | `docker info` falla; Docker Desktop no está en ejecución |
| Supabase CLI | **Ausente** | — |

### Estado de Git en la inspección inicial

```text
git status --short --branch
## main

git log --oneline
8d45f29 chore: initialize repository with gitignore
```

### Exclusiones comprobadas

```text
git check-ignore -v docs/no_visible_en_github/MASTER_SPEC.md
.gitignore:12:no_visible_en_github/   docs/no_visible_en_github/MASTER_SPEC.md
```

### Gates de calidad

**Ninguno aplica todavía.** No existe `package.json`, por lo que `pnpm lint`,
`pnpm typecheck`, `pnpm test` y `pnpm build` no pueden ejecutarse. Esperado en FASE 0.

---

## Verificaciones manuales pendientes

Corresponden a Joan:

1. **Q-003** — instalar Node 24.19.0, pnpm 11.24.0 y la CLI de Supabase, y arrancar Docker Desktop. La máquina tiene hoy Node v22.22.2.
2. **Q-004** — autorizar `git push -u origin main` y confirmar que el remoto está vacío.
3. Asegurar una copia de seguridad de `docs/no_visible_en_github/` fuera del proyecto: Git no protege esos archivos.

---

## Bloqueos y preguntas

| ID | Asunto | Estado | Bloquea |
|---|---|---|---|
| Q-001 | Visibilidad de `CLAUDE.md` | `RESUELTA` — público | — |
| Q-002 | Qué documentación es pública | `RESUELTA` — privado el diseño, público el método | — |
| Q-003 | pnpm, Docker y Supabase CLI | `ABIERTA` | LEX-1.1, LEX-1.7 |
| Q-004 | Primer push al remoto público | `ABIERTA` | LEX-0.8 |

Ninguna impide continuar con LEX-0.3 a LEX-0.7.

---

## Riesgos o deuda conocida

- **El repositorio es público desde el primer commit.** Cualquier archivo confirmado
  una sola vez queda permanentemente en el historial y en los forks, aunque se borre
  después. Comprobar `git status` antes de cada commit.
- **`MASTER_SPEC.md` y `ROADMAP.md` quedan fuera de Git:** sin historial, sin copia de
  seguridad y sin revisión por PR. Riesgo real de pérdida por borrado accidental.
- El remoto `origin` está configurado pero no verificado: no se sabe si está vacío.
- Docker no operativo impide validar el flujo de Supabase local.
- `MASTER_SPEC.md` §22 sigue redactada suponiendo que toda la documentación se
  versiona. La desviación está registrada en Q-002 y en el registro de cambios del
  roadmap, no propagada en silencio.
- Sin `LICENSE`. Repositorio público sin licencia = todos los derechos reservados
  por defecto. Debe decidirse antes de la publicación de la V1 (LEX-10.10).

---

## Siguiente acción exacta

**M0 cerrado.** La siguiente tarea es **LEX-1.1**: crear la aplicación Next.js con
App Router, TypeScript estricto y pnpm, fijando las versiones acordadas en
`WORKFLOW.md`.

**Está bloqueada por Q-003.** Antes de empezar hay que preparar la máquina:

```text
1. Instalar Node 24.19.0            (hoy hay v22.22.2)
2. corepack enable pnpm             (pnpm 11.24.0)
3. Arrancar Docker Desktop          (el daemon no responde)
4. Instalar la CLI de Supabase
```

Los pasos 3 y 4 solo hacen falta a partir de LEX-1.7, pero conviene resolverlos a
la vez.

Queda además **Q-004** abierta: el primer `push` sigue sin autorizar.

---

## Qué no debe aparecer en este documento

Este archivo es público y se actualiza en cada tarea. Nunca debe contener:

- títulos, descripciones o criterios de tareas futuras del roadmap privado;
- contenido copiado de `MASTER_SPEC.md`;
- URLs de proyecto, *project refs*, claves o cadenas de conexión de Supabase;
- correos, rutas locales de la máquina del propietario o identificadores personales;
- nombres o contenido de los mazos privados de Anki usados como material de prueba;
- salidas de comandos sin revisar, que puedan arrastrar cualquiera de los anteriores.

Referencias por ID (`LEX-n.m`, `Q-nnn`) sí: identifican sin revelar.

---

## Estado de git

- Rama: `main`.
- Remoto: `origin` → `https://github.com/JoanOliver04/lexora.git` (**público**, configurado, sin push ni fetch).
- Contenido versionado: `.gitignore`, `README.md`, `CLAUDE.md`, `docs/STATUS.md`,
  `docs/OPEN_QUESTIONS.md`, `docs/evidence/README.md`, `docs/ARCHITECTURE.md`,
  `docs/DATA_MODEL.md`, `docs/FSRS.md` y `docs/adrs/` con cinco archivos.
