# LEX-1.13 — Landing mínima y health check

**Fecha:** 2026-08-27
**Rama:** `feat/lex-1-13-landing-health`
**Estado resultante:** `HECHO`

---

## 1. Landing

Sustituye la página de demostración de LEX-1.5 por una landing real, en español e
inglés, que explica el problema y el enfoque: reconocer una palabra no es lo mismo
que recuperarla, son capacidades distintas, y Lexora programa cada una por
separado.

Usa los tokens y componentes de LEX-1.6. Sigue sin haber identidad visual, que
`MASTER_SPEC.md` deja para cuando exista producto. La landing definitiva es
LEX-10.3.

## 2. El health check obligó a una decisión de arquitectura

La ruta necesita alcanzar la base de datos. Pero la regla de LEX-1.3 prohíbe que
`src/app/**` importe infraestructura, y el lint lo impide:

```text
error  '@/shared/infrastructure/...' import is restricted from being used by a
       pattern. La presentacion llama a un caso de uso, no a un repositorio
```

La salida fácil era añadir una excepción para las rutas. Es la peor de las
opciones: una excepción abre la puerta a que la siguiente ruta meta una consulta
directamente, y entonces la regla deja de significar nada.

La tensión es real y no se resuelve sola: la presentación no puede conocer
implementaciones concretas, pero **alguien** tiene que unir un caso de uso con la
suya.

### `src/composition/`

Ese alguien es una raíz de composición, y solo ella. Aquí se permite conocer
ambos lados porque su única responsabilidad es el cableado: no hay lógica de
negocio, ni consultas, ni decisiones.

```text
src/app/api/health/route.ts   →  src/composition/health.ts
                                     ├→ application/health/check-health.ts   (puerto)
                                     └→ infrastructure/health/…probe.ts      (implementación)
```

Encaja con las reglas existentes sin tocarlas: `composition` no es
`infrastructure`, así que la ruta puede importarla, y la regla que protege el
dominio sigue intacta.

Toda ruta futura que necesite datos pasará por aquí. Resolverlo ahora, con un
caso trivial, evita resolverlo con prisa cuando el caso sea la sesión de estudio.

## 3. Qué comprueba, y qué no cuenta

`GET /api/health` devuelve `{ status, app, database }`.

**`degraded`, no `error`.** La aplicación está sirviendo la respuesta, así que
decir que está caída sería falso. Lo que falla es una dependencia, y la diferencia
importa para quien recibe el aviso a las tres de la mañana.

**503, no 200 con un campo.** Los supervisores miran el código de estado. Un 200
significa «todo bien» para cualquiera que no lea el cuerpo.

**Sin caché.** Una respuesta guardada seguiría diciendo «ok» un cuarto de hora
después de que todo se cayera.

**No cuenta más de la cuenta.** El punto es público y sin autenticación: no expone
versiones, hosts, nombres de servicio ni mensajes de error. Un health check
hablador es reconocimiento gratuito para quien busca por dónde entrar; la
diferencia entre «algo va mal» y «PostgreSQL 15.3 en tal host rechazó la
contraseña» es la diferencia entre un aviso y un mapa.

**Tiene tiempo límite propio**, de 3 segundos. Sin él, una base de datos que
acepta la conexión pero no responde dejaría la petición colgada, y un health check
que tarda treinta segundos en decir que algo va mal no sirve para lo que existe.

## 4. Comprobado apagando la base de datos

Un health check que solo se ha visto decir «ok» no está probado: hasta que dice
«mal» cuando algo está mal, no se sabe si mira algo.

### Con la base de datos en marcha

```text
HTTP 200  |  {"status":"ok","app":true,"database":true}
Cache-Control: no-store, max-age=0
```

### Con la base de datos detenida

```text
HTTP 503  |  {"status":"degraded","app":true,"database":false}
```

Se ejecutó `pnpm db:stop` con el servidor de producción ya levantado y se repitió
la petición. La base se reinició después.

## 5. Tests

**Unitarios.** `check-health.test.ts` no toca la red ni la base de datos, y esa es
la razón de que el caso de uso dependa de un puerto: comprobar qué pasa cuando la
base no responde es trivial si puedes pasar una sonda que diga que no responde, y
muy incómodo si tienes que apagarla.

Incluye un tercer caso que documenta el comportamiento ante una sonda que lanza:
la excepción **se propaga**, a propósito. Capturarla escondería un error de
programación bajo un `degraded` que parecería un problema de red.

**Extremo a extremo.** Un test comprueba el código de estado, el cuerpo, la
cabecera de caché y —lo que importa— que el cuerpo **no contiene**
`postgres`, `supabase`, `127.0.0.1`, `54321` ni `version`.

## 6. Verificaciones ejecutadas

```text
pnpm check    exit=0   (17 tests unitarios)
pnpm e2e      14 passed (29.6s)
Prueba manual: 200/ok con base en marcha, 503/degraded con base detenida
```

## 7. La CI encontró un hueco que en local era invisible

El trabajo de extremo a extremo falló en la primera ejecución:

```text
expone la comprobación de salud sin filtrar detalles internos
  Expected: 200
  Received: 503
```

**El trabajo E2E no levantaba la base de datos.** En local no se notaba, porque
aquí siempre está encendida; en un runner limpio, el health check decía la verdad
—que no la alcanza— y el test lo detectó.

Es exactamente para lo que existe una CI: el fallo no estaba en el health check ni
en el test, sino en un supuesto que solo se sostenía en la máquina de desarrollo.

La corrección fue añadir Supabase al trabajo E2E, no relajar el test. Un test que
acepta 200 o 503 indistintamente deja de comprobar nada, y el trabajo E2E prueba
la aplicación como se despliega: la aplicación depende de la base de datos. Desde
la fase 2 habría hecho falta igualmente.

## 8. Fuera de alcance

- Landing de producto con capturas y demo → LEX-10.3 y LEX-10.4.
- Métricas y observabilidad → LEX-9.6, con Sentry.
- Identidad visual → después de que exista producto.
