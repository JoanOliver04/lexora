# Workflow, versionado y entornos

Convenciones de trabajo del repositorio. Decisiones fijadas el 2026-08-26 contra
la documentación oficial vigente en esa fecha.

> **Estado:** las decisiones son firmes; su aplicación empieza en la fase 1,
> cuando exista una aplicación que construir.

---

## 1. Ramas

Una rama por tarea del roadmap. El nombre lleva el ID para que el historial sea
navegable sin consultar otro documento.

```text
<tipo>/lex-<fase>-<tarea>-<slug-corto>
```

| Tipo | Cuándo |
|---|---|
| `feat` | Funcionalidad nueva. |
| `fix` | Corrección de un defecto. |
| `chore` | Herramientas, configuración, dependencias. |
| `docs` | Solo documentación. |
| `refactor` | Cambio interno sin alterar comportamiento. |
| `test` | Solo tests. |

Ejemplos: `feat/lex-4-2-delimited-parser`, `chore/lex-1-12-github-actions`.

`main` es la rama de integración y debe permanecer siempre en verde. Nunca se
reescribe su historial.

## 2. Commits

**[Conventional Commits](https://www.conventionalcommits.org/)**, con el ID de la
tarea como ámbito:

```text
feat(lex-5.9): commit a review atomically

Explica el porqué cuando no sea evidente en el diff. El asunto en
imperativo y por debajo de 72 caracteres.
```

Reglas:

- **Los commits, los mensajes de PR y los comentarios de código se escriben en inglés.** La documentación del proyecto está en español. La asimetría es deliberada: el código y su historial son la parte que un tercero puede leer sin contexto.
- Un commit no mezcla tareas distintas.
- Un commit no deja `main` roto.
- Nada de `--no-verify` ni de saltarse los hooks.

## 3. Pull Requests

Un PR por tarea, con el ID en el título. Debe incluir qué se hizo, qué comandos
se ejecutaron con su resultado real, y qué queda pendiente de comprobación
manual.

Requisitos para fusionar: CI en verde, diff revisado por completo —lockfile, SQL
y archivos generados incluidos—, y `docs/STATUS.md` actualizado.

## 4. Versiones fijadas

| Herramienta | Versión | Dónde se declara |
|---|---|---|
| Node.js | **24.19.0** | `.nvmrc` (local) y `engines.node: "24.x"` en `package.json` |
| pnpm | **11.24.0** | `packageManager: "pnpm@11.24.0"`, activado con `corepack enable pnpm` |
| CLI de Supabase | Por fijar en LEX-1.7 | Dependencia de desarrollo del proyecto, no instalación global |

**Por qué la CLI de Supabase como dependencia del proyecto.** La documentación
oficial ofrece en Windows la instalación global con Scoop o la dependencia de
proyecto. Se elige la segunda: fija la versión en el lockfile, un clon limpio
obtiene exactamente la misma sin instalar nada global, y no obliga a añadir otro
gestor de paquetes a la máquina. Se invoca como `pnpm supabase <comando>`.

**Por qué Node 24.** Es la línea LTS activa —Krypton— y la versión por defecto de
Vercel, que ofrece 24.x, 22.x y 20.x. Node 20 llegó al final de su vida en abril
de 2026 y Node 22 está en mantenimiento. Elegir la LTS activa evita una migración
de runtime a mitad del proyecto.

**Por qué versiones exactas y no rangos.** Un rango hace que dos máquinas
construyan cosas distintas y convierte «funciona en mi equipo» en un diagnóstico
imposible. Vercel aplica por su cuenta las actualizaciones menores y de parche del
runtime; lo que se fija aquí es la línea mayor y el entorno local.

**Cómo se actualizan.** Subir de línea mayor es un cambio deliberado: se anota en
el registro de cambios del roadmap, se ejecuta la suite completa y se verifica el
despliegue de preview antes de tocar producción.

## 5. Migraciones de base de datos

- Toda modificación de esquema va en una **migración SQL versionada** dentro del repositorio. Sin excepciones.
- Los tipos generados desde el esquema se regeneran en el mismo commit que la migración. La CI comprueba que no hay desalineación.
- Una base de datos limpia debe poder aplicar todas las migraciones y los datos semilla sin intervención manual.
- **No se modifica producción a mano desde el panel del proveedor.** Si una emergencia lo obliga, ver §7.
- Una migración destructiva exige plan de datos, estrategia de recuperación y autorización explícita del propietario.

## 6. Entornos

| Entorno | Base de datos | Quién la crea | Datos |
|---|---|---|---|
| `local` | Supabase local vía CLI y contenedores | El desarrollador | Semillas deterministas, sin datos personales |
| `preview` | Aislada de producción | Configurada en la fase 10 | Datos de prueba |
| `production` | Proyecto Supabase de producción | El propietario | Datos reales |

Reglas:

- **Ninguna preview apunta a datos personales de producción.** Es la regla que impide que un PR de un colaborador lea el contenido real de alguien.
- Cada entorno tiene sus propias variables. Nunca se comparte un valor entre entornos «por comodidad».
- `.env.example` documenta cada variable **sin valores reales** y se mantiene actualizado.
- La clave publicable del proveedor de datos puede llegar al cliente. Cualquier clave con privilegios, no: nunca aparece en el navegador, en un bundle, en un log ni en una captura.
- Producción se despliega solo desde la rama protegida.

## 7. Emergencias en producción

Si algo obliga a intervenir producción a mano:

1. Anotar qué se toca y por qué **antes** de tocarlo.
2. Hacer el cambio mínimo que restablezca el servicio.
3. Registrarlo en `docs/STATUS.md` el mismo día.
4. Convertirlo en una migración versionada en cuanto pase la urgencia, para que el esquema del repositorio vuelva a ser la verdad.

Una intervención manual sin registrar es peor que la incidencia que resolvió:
deja el esquema real y el versionado divergentes sin que nadie lo sepa.

## 8. Versionado del producto

[SemVer](https://semver.org/lang/es/). Hasta la V1 el proyecto permanece en
`0.x`; la primera versión pública será `1.0.0`.

Se etiqueta al cerrar un hito que produce algo desplegable. Las etiquetas no se
mueven ni se borran.

## 9. Documentos relacionados

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — capas, módulos y puertos.
- [`DATA_MODEL.md`](DATA_MODEL.md) — entidades y convenciones del esquema.
- [`../CLAUDE.md`](../CLAUDE.md) — protocolo de trabajo por tarea.
