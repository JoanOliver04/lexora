# LEX-1.6 — Sistema visual base

**Fecha:** 2026-08-27
**Rama:** `feat/lex-1-6-design-system`
**Estado resultante:** `HECHO`

---

## 1. Tokens

Definidos en `src/app/globals.css`, en espacio **oklch**: es perceptualmente
uniforme, de modo que dos colores con la misma luminosidad se ven igual de
claros. En `hsl` no ocurre, y por eso una paleta que parece coherente sobre el
papel resulta desigual en pantalla.

Los tokens se nombran **por su papel**, no por su aspecto: `--color-surface`, no
`--color-gris-claro`. Un token con nombre de color obliga a renombrarlo el día
que cambie la paleta, y en la práctica nadie lo renombra: acaba habiendo un
`--color-azul` que es verde.

Categorías: fondo y superficies, tinta en tres niveles, bordes en dos, acento,
peligro, foco, radios, elevación y duraciones.

**Esto es el sistema, no la identidad de marca.** `MASTER_SPEC.md` deja la
identidad para cuando exista producto; la paleta actual es neutra a propósito.

## 2. Contraste: comprobado, no afirmado

«Cumple AA» es de las afirmaciones más fáciles de hacer sin verificar. Así que
esta tarea deja un comprobador ejecutable, `scripts/check-contrast.mjs`, añadido
a `pnpm check`:

- lee los tokens directamente de `globals.css`, de forma que no puede
  desincronizarse de lo que realmente se sirve;
- convierte oklch → OKLab → sRGB y calcula la relación de contraste WCAG;
- **se autocomprueba** antes de nada: si blanco contra negro no da 21:1, la
  conversión está mal y aborta. Un informe con la matemática equivocada da
  confianza falsa, que es peor que no comprobar.

### Encontró un fallo real

Primera ejecución:

```text
Tema claro
  ✖   1.81:1  (min 3)  Borde de un control con el que se interactua
Tema oscuro
  ✖   2.26:1  (min 3)  Borde de un control con el que se interactua

✖ 2 combinacion(es) por debajo del minimo.
```

`--color-border-strong` —el borde de campos y botones secundarios— estaba muy por
debajo del mínimo de 3:1 que WCAG exige a los componentes de interfaz. A ojo
parecía correcto en ambos temas.

Corregido a `oklch(62% …)` en claro y `oklch(52% …)` en oscuro. Segunda ejecución:

```text
Autocomprobacion blanco/negro: 21.00:1  ✓

Tema claro                                    Tema oscuro
  ✓  18.26:1  Texto principal / fondo           ✓  17.02:1
  ✓  18.79:1  Texto principal / superficie      ✓  15.77:1
  ✓   6.91:1  Texto secundario                  ✓   8.30:1
  ✓   4.15:1  Texto de apoyo                    ✓   5.26:1
  ✓   6.63:1  Texto en boton principal          ✓   8.87:1
  ✓   7.23:1  Texto en boton destructivo        ✓   7.22:1
  ✓   6.44:1  Enlaces y acentos                 ✓   8.86:1
  ✓   3.53:1  Borde de control                  ✓   3.48:1
  ✓   5.40:1  Indicador de foco                 ✓   9.35:1

✓ Todas las combinaciones cumplen el minimo exigido.
```

Queda como comprobación permanente: LEX-9.4 no tendrá que auditarlo desde cero, y
un cambio de paleta que rompa el contraste falla la CI.

## 3. Temas, sin destello

Tres opciones: claro, oscuro y **seguir al sistema**. La tercera no es un tema, es
una instrucción, y por eso se guarda distinta de haber elegido claro. Sin esa
distinción, quien quiere seguir al sistema queda anclado al valor que tuviera el
día que abrió la aplicación.

`ThemeScript` es un script síncrono en el `<head>` que aplica el tema **antes del
primer pintado**. Un efecto de React llega tarde por definición: se ejecuta
después de pintar, y el resultado es un destello blanco en cada carga que, a
oscuras, resulta agresivo.

Verificado sobre el HTML realmente servido:

```text
Script de tema en la posicion: 1494
<body> en la posicion:         1914
OK: el script se ejecuta ANTES del cuerpo
```

Va envuelto en `try/catch`: `localStorage` lanza excepción con las cookies
bloqueadas o en modo privado restrictivo. Si falla, queda el tema claro, que es el
valor por defecto del CSS, y la página se ve bien igualmente.

## 4. Una regla de lint que tenía razón

La primera versión del selector de tema leía `localStorage` en un `useEffect` y
llamaba a `setState`. El lint lo rechazó:

```text
error  Calling setState synchronously within an effect can trigger cascading renders
       react-hooks/set-state-in-effect
```

La salida fácil era silenciar la regla. La correcta era `useSyncExternalStore`,
que es exactamente la API para esto: la preferencia **es** un almacén externo
—vive en `localStorage`, puede cambiarla otra pestaña y el servidor no puede
conocerla—.

El cambio arregló además un problema que no se había buscado: el almacén escucha
el evento `storage`, así que cambiar el tema en una pestaña se refleja en las
demás. Con la versión anterior, cada pestaña se quedaba con lo que leyó al montar.

## 5. Accesibilidad incorporada desde el principio

| Decisión | Motivo |
|---|---|
| `:focus-visible` con contorno de 2px y separación | Quien navega con teclado necesita saber dónde está. Sin esto la aplicación es inservible sin ratón. |
| `prefers-reduced-motion` reduce todo a 0.01ms | El movimiento provoca mareo y migraña a personas con trastorno vestibular. No es cortesía. Se usa 0.01ms y no 0 porque algunos navegadores no disparan los eventos de fin de transición con duración exacta cero. |
| Altura mínima de 44px en botones y campos | Es el objetivo táctil recomendado. Un control de 32px funciona con ratón y falla con el pulgar, que es como se va a usar esto. |
| `aria-invalid` cambia el borde, sin sustituir al mensaje | El color nunca es el único indicador. |
| `role="radiogroup"` en el selector de tema | Son opciones excluyentes; anunciarlas como botones sueltos pierde esa relación. |

## 6. Componentes base

Tres, y solo tres: `Button`, `Input`, `Label`. **No se ha instalado `shadcn/ui`
entero**; está pensado para copiar componentes cuando se necesitan, y arrastrar
treinta que nadie usa es deuda desde el primer día.

`Button` fuerza `type="button"` por defecto. El valor por defecto de HTML es
`submit`, y un botón dentro de un formulario que solo abre un menú acaba
enviándolo.

## 7. Excepción de lint añadida

`no-console` se desactiva en `scripts/**`. Ahí `console.log` es la salida del
programa, no depuración olvidada. La excepción está acotada a esa carpeta.

## 8. Verificaciones ejecutadas

```text
pnpm format:check   All matched files use Prettier code style!
pnpm lint           exit=0
pnpm typecheck      exit=0
pnpm contrast       exit=0   (18 combinaciones, dos temas)
pnpm build          exit=0
pnpm check          exit=0
```

Servidor de producción: `/es` sirve el script de tema antes del cuerpo.

## 9. Fuera de alcance

- Identidad visual, paleta de marca y tipografía con personalidad → después de que exista producto.
- Componentes complejos → cuando haga falta uno, no antes.
- Auditoría completa WCAG de flujos reales → LEX-9.4. Aquí solo hay una página.
