# LEX-1.7 — Supabase local

**Fecha:** 2026-08-27
**Rama:** `feat/lex-1-7-supabase-local`
**Estado resultante:** `HECHO`. Cierra Q-003.

---

## 1. El bloqueo, resuelto

Q-003 llevaba abierta desde LEX-0.1. La causa resultó no ser configuración:

| | Versión | Fecha |
|---|---|---|
| Docker Desktop instalado | 4.18.0 | marzo de 2023 |
| WSL en la máquina | 2.7.8.0, kernel 6.18.33 | 2026 |

Tres años de diferencia. `dockerd` moría al instante y su registro solo contenía
`EOF`: ni una línea de error, que es la firma de una incompatibilidad de
binarios, no de un ajuste mal puesto.

Actualizado a Docker Desktop 4.88.1 por el propietario. El motor arranca en unos
30 segundos: servidor 29.7.2, 12 CPU, 8 GB.

## 2. La CLI, como dependencia del proyecto

`supabase@2.116.0` en `devDependencies`, **no** como instalación global con Scoop.
Decidido en Q-003 y registrado en `WORKFLOW.md`.

Motivos: la versión queda fijada en el lockfile, un clon limpio obtiene
exactamente la misma sin instalar nada, y la máquina no necesita otro gestor de
paquetes. Se invoca con `pnpm exec supabase` o por los scripts.

## 3. Scripts

| Script | Qué hace |
|---|---|
| `pnpm db:start` | Levanta el entorno local. |
| `pnpm db:stop` | Lo detiene. |
| `pnpm db:status` | Muestra URLs y claves locales. |
| `pnpm db:reset` | Recrea la base desde cero: migraciones + semillas. |
| `pnpm db:types` | Regenera `database.types.ts` desde el esquema real. |

## 4. Variables de entorno

Añadidas al esquema de cliente, que ya las esperaba comentadas desde LEX-1.4:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

La clave *publishable* va en el esquema de **cliente** a propósito. Está pensada
para vivir en el navegador: no concede permisos por sí misma, porque quien decide
qué puede leer o escribir cada usuario es Row Level Security dentro de PostgreSQL.
Publicarla es el uso previsto.

**La clave secreta no está en ninguna parte del repositorio**, ni siquiera
comentada en `.env.example`. No hace falta para el funcionamiento normal: las
operaciones se hacen con la sesión del usuario y RLS. `.env.example` lo dice
explícitamente, para que nadie la añada «por si acaso».

Los valores locales viven en `.env.local`, comprobado que está ignorado:

```text
git check-ignore -v .env.local
.gitignore:15:.env.*   .env.local
```

Esas claves locales son idénticas en cualquier instalación de Supabase y no
protegen nada. Aun así van en `.env.local` y no en el repositorio: la costumbre
tiene que ser siempre la misma, porque el día que una clave sí importe nadie se
acuerda de cambiar de costumbre.

## 5. Tipos generados

`database.types.ts` se genera desde el esquema real, que sale de las migraciones
versionadas. Excluido de Prettier y de ESLint: formatear un fichero generado
produce un diff en cada regeneración.

Se regenera **en el mismo commit que la migración que lo cambia**. Separarlos hace
que el tipo y la tabla dejen de coincidir, y entonces el compilador aprueba
consultas que la base de datos rechazará en ejecución. La CI lo comprobará desde
LEX-1.12.

## 6. Semillas

`supabase/seed.sql` existe y está vacío a propósito: todavía no hay ninguna tabla.
Las primeras semillas llegan en la fase 2.

Existe aun vacío porque, sin él, cada `db:start` y cada `db:reset` avisan de que
no lo encuentran, y un aviso permanente que se aprende a ignorar acaba tapando uno
que importa. El fichero documenta además las reglas para cuando se rellene:
deterministas, sin datos personales y sin material privado del propietario.

## 7. Dos incidencias durante la puesta en marcha

### El primer `supabase start` falló

```text
LegacyHealthCheckTimeoutError: supabase_studio_lexora container is not ready
```

Y el primer `db reset` también, con `error running container: exit 1`. Ambos
funcionaron al reintentar sin cambiar nada.

Diagnóstico: contenedores asentándose tras la primera descarga de imágenes, con
Realtime todavía ejecutando sus migraciones internas. No es un fallo del proyecto,
pero **se registra porque volverá a pasar** en cualquier máquina que arranque el
entorno por primera vez. Reintentar es la respuesta correcta; buscar la causa en
la configuración propia es perder una tarde.

### Un test falló bajo carga

Durante una ejecución con los contenedores arrancando, `pnpm test` dio un fallo y
la puesta en marcha del entorno jsdom tardó **45 segundos** —normalmente tarda
menos de uno—. Al repetir, los 14 pasaron.

Los tiempos límite por defecto de Vitest (5 s) bastan con la máquina libre, no con
Supabase compitiendo por CPU y disco. Subidos a 15 s por test y 30 s por hook.

Esto no esconde lentitud del código propio: ninguno de estos tests hace trabajo
real durante ese tiempo. Lo que evita es un fallo intermitente que no dice nada
sobre el código y que, repetido, enseña a desconfiar de la suite.

## 8. Verificaciones ejecutadas

```text
pnpm db:start      exit=0   API 54321 · DB 54322 · Studio 54323
pnpm db:reset      exit=0   recrea desde cero y aplica semillas
pnpm db:status     exit=0
pnpm db:types      exit=0   fichero generado en UTF-8 limpio
pnpm check         exit=0   formato, lint, tipos, contraste, tests y build
```

## 9. Fuera de alcance

- Clientes SSR de Supabase → LEX-1.8.
- pgTAP y pruebas de base de datos → LEX-1.10.
- Primeras migraciones y tablas → fase 2.
