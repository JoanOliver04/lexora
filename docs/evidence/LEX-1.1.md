# LEX-1.1 — Aplicación Next.js con App Router, TypeScript estricto y pnpm

**Fecha:** 2026-08-26
**Rama:** `feat/lex-1-1-next-app`
**Estado resultante:** `HECHO`

---

## 1. Versiones instaladas

Comprobadas contra el registro de paquetes y la documentación oficial en la fecha
de ejecución, no supuestas.

| Paquete | Versión | Nota |
|---|---|---|
| Next.js | 16.3.3 | Última estable. Turbopack es el empaquetador por defecto. |
| React / React DOM | 19.2.8 | La que acompaña a esa versión de Next. |
| TypeScript | 5.9.3 | `create-next-app` fija `^5`. Existe TypeScript 7.0.2, la reescritura nativa, pero Next.js documenta un mínimo de 5.1 y no la menciona: adoptarla ahora sería asumir riesgo sin necesidad. |
| ESLint | 9.39.5 | Con `eslint-config-next`. |
| Tailwind CSS | 4.3.3 | |
| Node.js | 24.19.0 | Fijado en `engines.node: "24.x"` y en `.nvmrc`. |
| pnpm | 11.24.0 | Fijado en `packageManager`. |

## 2. Cómo se generó

`create-next-app@16.3.3` en un directorio temporal, con opciones explícitas en
lugar de `--yes`, y después se movió el resultado al repositorio.

El motivo del rodeo: `create-next-app` se niega a escribir sobre un directorio con
ficheros en conflicto, y con `--yes` genera un `AGENTS.md` **y un `CLAUDE.md`**
propios. Este repositorio ya tiene los suyos, y sobrescribir el protocolo de
trabajo con una plantilla habría sido una pérdida silenciosa.

```text
--typescript --tailwind --eslint --app --src-dir
--import-alias "@/*" --use-pnpm --disable-git --no-agents-md --skip-install
```

Del andamiaje generado **no** se incorporaron su `README.md` ni su `.gitignore`;
el del repositorio se amplió a mano con lo que faltaba.

## 3. Ajustes sobre lo generado

| Cambio | Motivo |
|---|---|
| `name`: `lexora` | Nombre interno acordado. |
| `engines.node: "24.x"` | La plantilla no lo incluye. Sin él, Vercel usaría su versión por defecto en lugar de la acordada. |
| `@types/node`: `^20` → `^24` | La plantilla fija `^20`. Los tipos deben corresponder al runtime que se ejecuta. |
| `description` | Identifica el paquete. |
| `.gitignore` ampliado | `next-env.d.ts`, `.pnp*` y registros de depuración. Se conservó `!.env.example`, que la plantilla habría anulado con su `.env*`. |

## 4. Verificaciones ejecutadas

### En el árbol de trabajo

```text
pnpm install      Done in 1m 28.9s using pnpm v11.24.0
pnpm lint         exit=0
pnpm build        exit=0   Compiled successfully in 3.9s
pnpm exec tsc --noEmit     exit=0
```

Servidor de desarrollo: responde **HTTP 200** con HTML renderizado, 16.713 bytes,
unos 5 segundos tras el arranque.

Rutas generadas: `/` y `/_not-found`, ambas estáticas.

### Clon limpio

Prueba real de reproducibilidad: clonado del repositorio a un directorio vacío y
ejecución desde cero.

```text
git clone --branch feat/lex-1-1-next-app --single-branch
pnpm install --frozen-lockfile     Done in 22.9s
pnpm build                         exit=0
pnpm exec tsc --noEmit             exit=0
pnpm lint                          exit=0
```

`--frozen-lockfile` demuestra que el lockfile versionado es suficiente y
coherente: la instalación falla si no lo fuera.

## 5. Hallazgos

### `tsc --noEmit` falla en un árbol recién clonado

La primera ejecución dio:

```text
src/app/layout.tsx(20,50): error TS2304: Cannot find name 'LayoutProps'.
```

No es un defecto. Next.js 16 genera los tipos de rutas, páginas y layouts en
`.next/types/`, y el layout raíz de la plantilla los usa. Sin generarlos, el
comprobador no los encuentra.

**Consecuencia para la CI (LEX-1.12) y los scripts (LEX-1.2):** la comprobación de
tipos debe ir precedida de `next typegen` —que genera esos tipos sin construir la
aplicación entera— o de un build completo. Un `typecheck` suelto en un runner
limpio fallaría sin motivo real.

### `next dev` modifica `CLAUDE.md`

Al arrancar, Next.js añade por su cuenta un bloque delimitado a `CLAUDE.md`, con
un aviso de que la versión 16 introduce cambios que rompen respecto a lo que un
agente pueda dar por sabido, y con la ruta a la documentación incluida en el
propio paquete.

Se conserva y se enmarca con una explicación, en vez de borrarlo: el propio bloque
advierte de que `next dev` lo vuelve a añadir, así que eliminarlo solo dejaría el
árbol permanentemente sucio.

### `eslint-config-next` arrastra ESLint 9

pnpm avisa de que existe ESLint 10.9.1 y marca la 9.39.5 como obsoleta. No se
fuerza la subida: `eslint-config-next@16.3.3` está construida contra la 9, y
adelantarse a lo que soporta el framework es pedir un problema. Se revisará en
LEX-1.2.

## 6. Fuera de alcance, deliberadamente

- Estructura modular por capas y reglas de dependencia → LEX-1.3.
- Scripts canónicos (`format`, `typecheck`, `test`) y ajustes de calidad → LEX-1.2.
- Sistema visual y componentes base → LEX-1.6.
- Internacionalización → LEX-1.5.

La aplicación generada conserva la página de ejemplo de la plantilla. Se sustituye
en LEX-1.13.

## 7. Estado al cerrar

Rama `feat/lex-1-1-next-app`, fusionada en `main`. Sin `push`: Q-004 sigue abierta.
