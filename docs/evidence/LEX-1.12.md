# LEX-1.12 — CI en GitHub Actions

**Fecha:** 2026-08-27
**Rama:** `feat/lex-1-12-ci`
**Pull Request:** [#1](https://github.com/JoanOliver04/lexora/pull/1)
**Estado resultante:** `HECHO`

---

## 1. Por qué esta tarea esperó

Una CI que nunca ha corrido no es evidencia de nada. LEX-1.12 se dejó pendiente
mientras el repositorio no estaba publicado, en vez de escribir el fichero y
marcarla `HECHO` sin haberla visto funcionar.

Q-004 se resolvió el 2026-08-27 y el repositorio se publicó. Entonces se hizo
esta tarea.

## 2. Tres trabajos

| Trabajo | Qué comprueba | Duración |
|---|---|---|
| **Calidad** | Formato, lint, tipos, contraste WCAG, tests unitarios, build de producción | 35 s |
| **Base de datos** | Supabase en marcha, migraciones desde base vacía, pgTAP, tipos alineados | 2 m 23 s |
| **Extremo a extremo** | Playwright sobre Chromium | 1 m 2 s |

Corren en paralelo. Se cancela la ejecución anterior si llega un push nuevo sobre
la misma rama: revisar el resultado de un commit ya reemplazado no sirve y gasta
minutos.

## 3. Dos detalles que vienen de hallazgos previos, no de una plantilla

### `next typegen` antes de `tsc`

El layout raíz usa tipos que Next.js genera en `.next/types/`. Sin ese paso
previo, la comprobación falla en cualquier árbol limpio con
`Cannot find name 'LayoutProps'`. Se descubrió en LEX-1.1, se arregló en el
script `typecheck` en LEX-1.2, y la CI lo hereda.

Sin ese antecedente, este trabajo habría fallado en la primera ejecución por un
motivo que no tiene nada que ver con el código.

### Los tipos generados deben corresponder al esquema

El trabajo de base de datos regenera `database.types.ts` y falla si difiere del
versionado.

El esquema es la fuente de verdad; el fichero de tipos es su reflejo. Cuando se
separan, el compilador empieza a **aprobar consultas que la base de datos
rechazará en ejecución**: el peor tipo de fallo, porque el error aparece lejos de
su causa.

## 4. Instalación reproducible

`pnpm install --frozen-lockfile` en los tres trabajos. Falla si el lockfile no
corresponde al `package.json`.

Sin esa opción, la CI resolvería versiones que nadie ha ejecutado en local y
aprobaría un árbol que nunca se ha probado tal cual.

## 5. Lo que no se ejecuta, y por qué

- **Supabase arranca sin Studio, imgproxy, vector ni logflare.** No participan en
  ninguna prueba, y cada contenedor de más es tiempo de arranque en cada
  ejecución.
- **Solo Chromium.** Firefox y WebKit se añadirán cuando exista producto que pueda
  romperse de forma distinta en cada motor. Hoy alargarían cada ejecución sin
  cubrir nada.

## 6. Verificación

### La CI pasó en verde a la primera

```text
✓ Calidad          35s
✓ Extremo a extremo 1m2s
✓ Base de datos     2m23s
```

Un resultado que merece un matiz: **el trabajo de base de datos regeneró
`database.types.ts` en Linux y coincidió byte a byte con el generado en Windows.**
Eso no estaba garantizado —los finales de línea son la causa habitual de que no
coincida— y confirma que el `.gitattributes` de LEX-1.6 hace su trabajo.

### El control de tipos falla cuando debe

Que un control pase no demuestra que detecte nada. Se simuló la deriva
localmente, replicando el paso de la CI:

```text
::error::database.types.ts no corresponde al esquema.
 src/shared/infrastructure/supabase/database.types.ts | 2 ++
-> la CI habria fallado (exit 1)
```

Se hizo en local en lugar de empujando un commit roto: el resultado es el mismo y
no ensucia el historial del Pull Request ni gasta minutos.

## 7. Lo que la CI garantiza a partir de ahora

Que un clon limpio, en una máquina que no es la del desarrollador:

- instala exactamente las versiones del lockfile;
- pasa formato, lint y tipos estrictos;
- cumple el contraste WCAG de todos los tokens;
- pasa los tests unitarios, incluida la regresión de la regla de capas;
- construye para producción;
- levanta la base de datos y aplica **todas** las migraciones desde vacío;
- cumple el invariante de que ninguna tabla de `public` está sin RLS;
- mantiene los tipos generados en correspondencia con el esquema;
- sirve la aplicación y pasa los doce tests de navegador.

## 8. Fuera de alcance

- Despliegue automático → fase 10.
- Firefox y WebKit → cuando el coste sea razonable.
- Base de datos aislada para previews → LEX-10.6.
