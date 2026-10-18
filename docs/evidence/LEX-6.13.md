# LEX-6.13 — Validación responsive y aceptación física

**Fecha:** 2026-10-16

**Última preparación local:** 2026-10-18; no constituye aceptación física.

**Rama / base:** `test/lex-6-13-responsive-validation` / `f6cbdc5`

**Estado:** `EN PROCESO`. Q-009 abierta: falta informe manual del propietario.
No se ha probado un Poco F5 físico ni escuchado un lector de pantalla real.

## Alcance ejecutado

Se reutiliza el flujo con datos sintéticos de `study-keyboard.spec.ts`, sin otro
backend ni fixture privado. `assertStudyLayout` comprueba cinco etapas: selector,
frente, respuesta, pausa y cierre. Cada una recorre cuatro condiciones: viewport
del proyecto con texto al 100 %, el mismo con texto al 200 % y tema oscuro,
320 px al 100 % oscuro y 320 px al 200 % oscuro. ES/EN en escritorio Chromium
y Poco F5 emulado producen 80 combinaciones de etapa/idioma/perfil/condición.

Mide overflow horizontal, solapamiento real de texto entre términos y cifras
del resumen mediante rangos DOM y tamaño de botones/enlaces visibles del área
principal (al menos 44 × 44 px). Conserva screenshots y restaura viewport, tema
y tamaño de texto al terminar. No añade nuevos casos con usuarios duplicados;
amplía las aserciones del recorrido existente, que sigue comprobando guardado,
foco, controles nativos y privacidad.

La primera ejecución encontró un fallo real en español a 320 px con texto al
200 %: «Disponibles ahora» colisionaba con la cifra 0, aunque no hubiera scroll
horizontal. La captura confirmó el problema. Corrección mínima: las tres listas
de pares del resumen reservan ancho automático a los números y permiten dividir
el texto restante. No cambian recuentos, semántica, orden, acciones ni guardado.
Se conserva la aserción que fallaba, sin esconder el texto ni reducirlo.

Estas pruebas amplían texto CSS; **no son zoom nativo del navegador**, ajustes
reales de Android, prueba táctil con una mano ni aceptación por lector real.
Las regresiones de Hoy y renderer mantienen su cobertura previa de contenido
largo, tres modos, tema oscuro y texto ampliado.

Migraciones, dependencias y cambios de ADR: **0**. Sin seed, reset, push, CI
remota, despliegue, cambio de plan o datos reales. La guarda de sesión anterior
sigue pendiente de producción. No se inicia LEX-6.14 ni se cierra el hito.

Verify-and-stop acota las verificaciones a esta aceptación; surgical-patch guía
el arreglo CSS reproducido. Cavecrew revisó de forma independiente CSS y prueba,
sin hallazgos pendientes; su revisión no se presenta como aceptación física.

## Comprobaciones

```text
CI=1 pnpm e2e tests/e2e/study-keyboard.spec.ts --workers=2 --retries=0
  antes del arreglo: 3 passed / 1 failed, 34.7 s
  fallo: es-completed-narrow-320-text-200, términos solapados

CI=1 pnpm e2e tests/e2e/study-keyboard.spec.ts tests/e2e/study-renderer.spec.ts tests/e2e/today.spec.ts --workers=2 --retries=0
  12 passed, exit 0, 57.7 s; sin reintentos

LEXORA_DB_TESTS=1 pnpm check
  exit 0: formato, lint, tipos, contraste 18/18 y build
  88 files passed + 1 skipped / 738 tests passed + 1 skipped

CI=1 pnpm e2e --workers=2 --retries=0
  124 passed + 4 skipped (casos privados preexistentes), exit 0, 2.7 min

Smoke del servidor manual local
  GET /es HTTP 200; GET /api/health HTTP 200, status ok

pnpm format:check (cierre documental) y git diff --check
  exit 0
```

La configuración efectiva local se inspecciona sin mostrar claves: backend
loopback en 54321, URL de sitio localhost en 3000 y clave pública presente.
La web pública anterior no incluye esta rama y no sirve para aceptar estos
cambios. No se cambia su configuración para hacer las pruebas.

En la regresión dirigida y el E2E completo se observó la incidencia preexistente
de Auth «JWT issued at future». El auxiliar de alta ya existente se recuperó y
los casos pasaron; no se añaden reintentos ni cambios de autenticación para ocultarla.
Capturas del resumen ES y respuesta EN con texto al 200 %/320 px inspeccionadas.
Diff completo revisado: siete archivos, sin cambios de SQL, tipos generados o
lockfile. Los 82 enlaces relativos resuelven y no se detectan patrones de
credenciales. Documentación privada, variables y artefactos siguen ignorados.
Checkpoint conservado en un commit local, sin marcar la tarea HECHO.

## Cómo probar la versión correcta

### Preparación comprobada el 2026-10-18

HEAD de producto `b140047`, árbol de código limpio. Hay dos procesos locales
existentes en 3000: servidor optimizado en IPv4 loopback y desarrollo en IPv6.
La pestaña de Chrome en `localhost` usa el de desarrollo. Ambos devuelven HTTP
200 y sirven la regla CSS corregida de LEX-6.13. Las configuraciones de desarrollo
y producción local apuntan a Supabase loopback en 54321 y sitio localhost 3000;
verificación sin imprimir claves. No se detiene ni se reconfigura ningún proceso.

La cuenta autenticada de la pestaña local existía, pero no había completado el
onboarding ni tenía curso/contenido. Por autorización del propietario se completó
el curso de prueba con A1 inicial y cupo de 5 nuevos al día, y se crearon mediante
los formularios normales un mazo «Prueba local LEX-6.13», dos conceptos sintéticos
y cuatro tarjetas: reconocimiento, recuperación, completar huecos y una segunda
de reconocimiento con texto largo/pista. Los dos conceptos están ligados al mazo.
No se crea otra cuenta, no se accede a contraseñas y no se usa un cliente privilegiado.

La sesión real del navegador confirma Hoy con 4 nuevas disponibles, 0 repasos
realizados y el enlace «Empezar sesión» habilitado. No hay una sesión de estudio
anterior; no se ha creado ninguna ni valorado tarjetas durante esta preparación.
Se deja la pestaña en `http://localhost:3000/es/app`.

`/es` y `/en` son la portada pública, aunque indiquen «Cerrar sesión»; no son Hoy.
Rutas exactas: **`http://localhost:3000/es/app`** y **`http://localhost:3000/en/app`**.
Health del servidor usado por Chrome: HTTP 200, `status: ok`.

Solo se prepara contenido sintético de la cuenta local actual. Sin seed, reset,
SQL ad hoc, migración, cambio de plan o acceso a producción. Las comprobaciones
físicas y de lector real siguen sin realizarse: Q-009 abierta y tarea EN PROCESO.

### Windows

El servidor optimizado preparado el 16 sigue en `127.0.0.1:3000`, con logs
ignorados en `test-results/manual-lex-6-13-server*.log`; el 18 se detecta además
el servidor de desarrollo descrito arriba. Ambos usan el código local correcto.
Abrir `http://localhost:3000/es/app` y `/en/app` con la cuenta local de prueba.
Solo si no queda ningún servidor activo en 3000, desde la raíz del repositorio:

```powershell
pnpm build
pnpm exec next start --hostname 127.0.0.1 --port 3000
```

Mantener esa terminal abierta. Supabase local debe estar iniciado; **no** usar
reset ni seed para esta aceptación. Usar una cuenta local de prueba, distinta
de producción, y contenido de ejemplo propio. No introducir datos sensibles.

### Poco F5 físico sin desplegar

Chrome permite acceder al servidor del PC mediante puertos reenviados por USB;
la conexión no depende de exponerlo a Internet. Preparación basada en la
[guía oficial de Chrome](https://developer.chrome.com/docs/devtools/remote-debugging/local-server).

1. Conectar el teléfono por USB al propio PC y habilitar depuración USB en las
   opciones de desarrollador. Aceptar únicamente la autorización de ese PC.
2. En Chrome de Windows abrir `chrome://inspect/#devices`, activar detección USB
   y comprobar que aparece el teléfono. Abrir **Port forwarding**.
3. Activar el reenvío y añadir dos pares: `3000` → `127.0.0.1:3000` y
   `54321` → `127.0.0.1:54321`. El segundo permite el Auth local del navegador.
4. En Chrome del teléfono abrir `http://localhost:3000/es/app` y luego `/en/app`.
   Mantener PC, servicios y cable conectados. Si no carga, detener esta prueba;
   no sustituir la URL por la de producción ni cambiar claves.
5. Al acabar, desactivar reenvío y depuración USB. No enviar capturas con
   credenciales o información privada.

El agente no ha conectado el teléfono ni ejecutado esos pasos en él. La guía
de [depuración de Android](https://developer.chrome.com/docs/devtools/remote-debugging)
detalla la detección y autorizaciones si el dispositivo no aparece.

## Recorrido manual y plantilla de resultado

Repetir en ES y EN; no hace falta compartir el contenido estudiado:

| Comprobación | Resultado del propietario |
|---|---|
| Windows: navegador/versión; zoom nativo 100 % y 200 % | Pendiente |
| Windows: Tab/Mayús+Tab, revelar, valorar y foco tras avanzar | Pendiente |
| Poco F5: Android/Chrome, orientación vertical y tamaño de texto normal | Pendiente |
| Poco F5: texto ampliado y zoom, sin cortes, cifras solapadas o scroll horizontal | Pendiente |
| Hoy → selección → frente → respuesta → guardado → pausa → reanudar → cerrar | Pendiente |
| Con una mano: alcanzar controles sin pulsaciones accidentales ni fatiga | Pendiente |
| Lector real: nombre/versión, frente sin respuesta prematura, reveal y mensajes útiles | Pendiente |
| Resumen: números legibles y refresco conserva el foco | Pendiente |

Informe suficiente: rama/commit probado, dispositivos y versiones, cada fila
PASS/FAIL/no realizada y, para cada fallo, pantalla/idioma/ajuste y descripción
breve. El valor «no realizada» no es un PASS. Contraseñas, tokens, códigos,
enlaces de confirmación y contenido privado no forman parte del informe.

## Siguiente acción exacta

Verificaciones automáticas completas y checkpoint conservado. Ahora,
recibir el informe de esta plantilla, resolver fallos y cerrar Q-009 solo con
evidencia física real. LEX-6.13 permanece `EN PROCESO` hasta entonces.
