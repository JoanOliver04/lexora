# ADR-004 — PWA online-first, sin estudio offline en la V1

**Estado:** Aceptado
**Fecha:** 2026-08-26
**Decide:** propietario del proyecto

## Contexto

Lexora se usará a diario en el móvil, y buena parte de su valor está en poder
abrirla desde el icono de la pantalla de inicio y estudiar en cinco minutos
muertos. Eso apunta a una aplicación web instalable.

«Instalable» y «funciona sin conexión» se confunden con frecuencia, y son cosas
muy distintas en coste. Lo segundo, para una aplicación de repetición espaciada,
significa mantener una cola local de repasos, calcular transiciones de memoria en
el dispositivo, y resolver qué ocurre cuando el mismo elemento se ha estudiado en
dos sitios antes de sincronizar. Eso es un problema de consistencia distribuida
sobre datos que el usuario no puede inspeccionar ni corregir a mano.

Hay además una restricción del dominio: el vencimiento de un repaso depende del
tiempo, y el reloj del navegador es manipulable y puede estar mal configurado.

## Decisión

**La V1 es instalable y requiere conexión para estudiar.**

Lo que sí se implementa:

- Manifest válido, iconos, modo *standalone* e instalación probada en un
  dispositivo Android real.
- Diseño *mobile-first* y comprobación de zonas seguras en pantalla.
- Una pantalla de respaldo propia cuando no hay conexión, en lugar del error
  genérico del navegador.
- Detección de conexión perdida con mensajes claros y recuperables.
- El *service worker* cachea recursos estáticos, nunca respuestas privadas.

Lo que **no** se implementa en la V1:

- Descarga de mazos para uso sin conexión.
- Valoración de tarjetas sin conexión y cola local.
- Resolución de conflictos al reconectar.
- Sincronización en segundo plano.

**El servidor es la autoridad sobre el tiempo, la identidad y el progreso.** Cada
valoración se confirma en el servidor antes de que la interfaz la dé por buena.

## Alternativas consideradas

**Offline completo desde la V1.**
Descartada. Es, con diferencia, la mayor fuente de complejidad de todo el
producto, y afecta justo a la parte cuya corrección importa más: el estado de
memoria. Un conflicto mal resuelto no da un error visible, da un calendario de
repasos silenciosamente equivocado, y el usuario no tiene forma de detectarlo.
Construir eso antes de que exista un motor de repaso probado y en uso real sería
resolver un problema difícil sin saber todavía si se tiene el problema.

**No hacer PWA en absoluto.**
Descartada. El coste de un manifest, unos iconos y una pantalla de respaldo es
bajo, y el valor en uso móvil diario es alto: abrir desde el icono, sin barra de
navegador, cambia lo suficiente la fricción como para afectar a la constancia,
que es el factor que decide si esta clase de herramienta funciona.

**Cola local «ligera» solo para repasos.**
Descartada, y es la alternativa más tentadora. Parece un punto intermedio barato,
pero introduce exactamente el mismo problema difícil —dos dispositivos con
estados divergentes del mismo elemento— con menos infraestructura para
resolverlo. Media solución a un problema de consistencia es peor que ninguna,
porque genera confianza injustificada.

## Consecuencias

**A favor:**

- El modelo de datos es más simple: hay un único estado válido, el del servidor.
- No hay lógica de fusión que probar ni fallos que dependan del orden de reconexión.
- Los vencimientos se calculan contra un reloj fiable.

**En contra, y aceptado:**

- **Sin conexión no se puede estudiar.** Es una limitación real en metro, avión o
  zonas con mala cobertura, y afecta a un caso de uso legítimo. Debe comunicarse
  con honestidad, no disimularse.
- Instalar la aplicación genera una expectativa de funcionamiento sin conexión
  que el producto no cumple todavía. La pantalla de respaldo debe explicarlo en
  lugar de limitarse a fallar.
- Queda deuda explícita para versiones posteriores, y hacerlo después será más
  caro que haberlo diseñado desde el principio. Se acepta a cambio de terminar
  antes un producto correcto.

## Cómo se verifica

- La interfaz nunca marca un repaso como guardado sin confirmación del servidor.
- Ningún dato privado queda cacheado de forma accesible sin sesión.
- Instalación y actualización probadas en un dispositivo Android físico.
- Ausencia de cualquier cola local accidental introducida por el *service worker*.

## Cuándo reabrir esta decisión

Cuando la V1 esté en uso real y se cumplan las dos condiciones:

1. El motor de repaso lleva tiempo funcionando correctamente y su comportamiento
   ante conflictos entre dispositivos está probado.
2. La falta de conexión ha impedido estudiar de forma medible y repetida, no
   hipotética.

Solo entonces tiene sentido diseñar la sincronización, con una estrategia de
resolución de conflictos explícita y probada antes de escribir la interfaz.
