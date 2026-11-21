# Picomatch — excepción temporal de alcance revisado

**Actualización del 21 de noviembre de 2026.** GitHub retiró el aviso el 18 de
noviembre. El registro devolvió cero avisos con el mismo lockfile y la excepción
eliminada. Se retiró el permiso temporal y su control de caducidad. La CI sigue
ejecutando `pnpm audit` sobre las dependencias.
[Aviso oficial retirado](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)

**Revisión:** 2026-11-17. **Caduca:** 2026-12-01T00:00:00Z.
**GHSA:** GHSA-fc5q-39xc-vjpf. **CVE:** CVE-2026-112366.

El control de dependencias de PR118 se detuvo en CI44176796669: un aviso alto
recién revisado por el feed afecta a picomatch<=4.0.7. El registro oficial
conserva4.0.7 como latest, publicado el24agosto, y no hay versión corregida
publicada. Se acepta de forma temporal el riesgo del alcance descrito, no se
declara corregida ni neutralizada la vulnerabilidad del compilador.

Fuentes: [aviso oficial](https://github.com/advisories/GHSA-fc5q-39xc-vjpf),
[paquete del mantenedor](https://github.com/micromatch/picomatch/blob/master/package.json)
y [auditoría de pnpm](https://pnpm.io/cli/audit).

## Alcanzabilidad revisada

El ataque necesita que un patrón extglob repetido malicioso llegue al compilador.
No se ha identificado una ruta desde una petición HTTP o contenido importado de
Lexora que suministre esos patrones. Las búsquedas de la biblioteca usan filtros
paramétricos de base de datos; el panel de accesos usa comparación de cadenas.

- picomatch2.3.2: ESLint→fast-glob→micromatch. La ruta del plugin Next hacia
  rootDir no se activa en esta configuración.
- picomatch4.0.7: next-intl→watcher y herramientas Vitest/Vite/tinyglobby/fdir.
  NextIntlPlugin configura solo requestConfig, sin extractor experimental; su
  inicialización retorna antes de crear el watcher. Los include/exclude de
  Vitest son patrones del repositorio, no datos enviados a la aplicación.
- Next16.4.6 trae además una copia compilada independiente. La traza completa
  de producción local contiene sus dos archivos en next-server.js.nft.json.
  Los consumidores de imágenes compilan patrones de next.config; Lexora no
  configura localPatterns/remotePatterns ni recibe esos patrones desde HTTP.

Se inspeccionaron32 trazas NFT, incluido el servidor raíz. No se encontraron
los paquetes independientes afectados ni el watcher en ellas. **Límite:** buscar
nombres en trazas y vetar referencias directas son señales de regresión; no
prueban ausencia de código empaquetado/inlined o llamadas mediante intermediarios.
Una revisión independiente de seguridad trazó los consumidores y no encontró
entrada de patrón no confiable en el alcance actual. No ejecutó PoC ni scanner.

## Controles y retirada

La auditoría estándar de pnpm sigue ejecutándose. Solo se exceptúa ese GHSA;
no se usa ignore-unfixable, ni se ignoran errores de red ni se rebaja la severidad.
El resultado esperado es transparente:1 high (1 ignored), no «cero avisos».
No se cambian versiones, integridades, registros o scripts de instalación.
La instalación sigue frozen-lockfile y las dos versiones permanecen fijadas en
el lock revisado. No se modifica a mano el compilador sin un parche upstream.

El guard de Node verifica antes de auditar:

- Caducidad bloqueante de catorce días, sin renovación automática.
- SHA256 con finales LF del lock, pnpm-workspace, next.config, Vitest, ESLint
  y package.json, incluidos los comandos de compilación. Para vercel.json se
  serializa el JSON parseado sin indentación y con salto LF final: Vercel
  reescribe ese archivo antes de compilar. No se omiten propiedades ni se
  ordenan arrays; cambios de valores, opciones nuevas o JSON inválido bloquean.
  Cualquier cambio requiere revisar y registrar otra vez el alcance.
- Referencias nuevas a paquetes de globbing en src, como señal conservadora.
- Que el registro aún anuncie4.0.7 como latest; otro valor o una respuesta
  fallida detienen la excepción para volver a revisar y actualizar.

El propio pnpm build exige la política antes de compilar y revisa después los
artefactos: NFT en Next sin adaptador, o mapas de assets de las funciones del
adaptador Vercel. Exige el inventario correspondiente al build, rechaza nuevos
paquetes de globbing y distingue la copia compilada de Next ya revisada. Esta
distinción está vinculada al lock/config fijados, no es permiso general para
futuros compiladores. Los controles no sustituyen la revisión de alcanzabilidad.

Retirar la excepción cuando haya solución upstream, cuando el aviso se retire,
o antes de incorporar nuevas fronteras que admitan patrones. Al caducar se
bloquean check, CI y el build versionado de Vercel; la app publicada no se detiene.
vercel.json fija pnpm build y el guard comprueba ese comando para conservar
ambos puntos de control también fuera de la CI de GitHub.

## Comprobaciones ejecutadas

- Auditoría completa antes de la excepción: exit1, un aviso high, versiones
  afectadas2.3.2/4.0.7, patched_versions null.
- pnpm install --frozen-lockfile: exit0, sin resolver paquetes nuevos.
- Pruebas del guard:9 PASS. Incluyen caducidad exacta, extensión indebida,
  ID distinto, fronteras omitidas/modificadas, nueva versión del registro,
  referencias de globbing y trazas nuevas o inválidas.
- La revisión detectó un P3: build directo no ejecutaba el guard aunque sí lo
  hacía check/CI. Se incorporaron los dos puntos de control a build y se fijó
  el comando en Vercel, con una regresión que rechaza ambos bypass.
- Guard con registro y trazas: exit0, scopeMatched true, compiledNextFiles2.
- pnpm audit: exit0,1 high (1 ignored), sin ocultar ese resultado.
- Gate completo con el build protegido:970 PASS+1 omisión privada, Nodebackup12
  y política9 PASS; formato/lint/tipos/28 contrastes/build/trazas PASS, exit0.
  La revisión de seguridad cerró el P3 tras inspeccionar el comando de build,
  la configuración de Vercel, su regresión y las siete huellas coincidentes.

La nueva CI debe acreditar también este guard en Linux, la instalación congelada
y la auditoría completa. No basta reutilizar los resultados anteriores de UX.

## Corrección de formato en Vercel — 2026-11-18

La CI44182145804 de PR118 pasó en Linux; Production7867388849 falló antes de
Next. El log aportado por el propietario identifica una huella distinta solo
para vercel.json. La reproducción local confirma que el valor observado
`9935a08fbd5f31eed21bffd348ea60a42e5d9d2e536a89e1a65557171e66eccd`
es exactamente SHA256 de JSON.stringify(config)+'\n'. Los valores y su orden
coinciden con el archivo revisado: era un falso positivo por formato.

Se normaliza únicamente la serialización de ese JSON antes del hash y se
actualiza su huella documentada. No se retira la comprobación ni se acepta
cualquier configuración: las seis huellas restantes, el build protegido, el
GHSA exceptuado y la fecha de caducidad permanecen intactos.

Regresión con la CLI real en una copia temporal aislada:1 FAIL antes del
arreglo, con los mismos hashes del log. Después10 pruebas del guard PASS,
sin omisiones. El caso nuevo acepta la reescritura compacta y otra indentación
con CRLF; rechaza comando, región, configuración de Git y opción añadida
modificados, además de JSON inválido. No accede a red, DB ni contenido privado.
El guard adicional con registro y trazas también pasa; el despliegue requiere
su propia CI y verificación de Production, registradas en la PR de corrección.

Gate completo18nov: LEXORA_DB_TESTS=1 pnpm check exit0,970 PASS+1 omisión
privada, Nodebackup12/política10, formato/lint/tipos/28 contrastes/build/trazas
PASS. La prueba nueva pasa sin errores ni omisiones. Revisión DEEP de los seis
archivos y revisión pasiva de seguridad del alcance modificado, sin hallazgos
accionables; no se afirma una auditoría exhaustiva de toda la aplicación.
Gitleaks8.30.1 del diff (12,91KB), exit0 y sin fugas.

La CI anterior solo ejercitaba los bytes del checkout, de ahí que no detectara
la reescritura del proveedor. La regresión ahora reproduce esa frontera antes
de compilar, en vez de depender de que el formato sobreviva al despliegue.

## Trazas del servidor de plataforma — 2026-11-18

PR119 corrigió el formato y pasó CI44275571017; Production7879557579 volvió
a fallar. Una comprobación local independiente con NOW_BUILDER=1 reprodujo
otro defecto del guard, confirmado después por el log del propietario: Next16.4.6
compiló correctamente, pero solo generó la traza del servidor mínimo, y el guard
exigió la del servidor completo. Tanto el comando local ejecutado como el log
aportado fallan después de compilar con Missing production server trace.

La señal coincide con hasNextSupport de next/dist/server/ci-info.js. Con ella,
el build observado produjo31 NFT, incluida next-minimal-server.js.nft.json;
sin ella se observaron32, incluida next-server.js.nft.json. El guard ahora exige
el nombre correspondiente a ese modo y revisa todas las trazas encontradas en
ambos casos. Solo admite esos dos nombres; no se introduce un modo sin traza.
La inspección del build de plataforma no encontró copias compiladas de
picomatch en sus NFT (compiledNextFiles0); no acredita ausencia de código
inlined ni inspecciona el servidor de imágenes que gestiona el proveedor.

Regresión nueva:1 FAIL antes del cambio con Missing production server trace;
después11 pruebas del guard PASS. Cubre las dos trazas, ausencia de la requerida,
nombre arbitrario y dependencia de globbing añadida en modo mínimo. El guard
con registro y las trazas reales del build de plataforma también pasa. La CI
añade un pnpm build con NOW_BUILDER=1 tras el build normal para verificar la
frontera real, conservando permisos, acciones fijadas, auditoría y demás gates.

Gate final de este arreglo: LEXORA_DB_TESTS=1 pnpm check exit0,970 PASS+
1 omisión privada, Nodebackup12/política11, formato/lint/tipos/28 contrastes y
build normal PASS (productionServerTrace completo, compiledNextFiles2).
Después NOW_BUILDER=1 pnpm build exit0, con traza mínima y compiledNextFiles0.
La nueva prueba pasó sin errores ni omisiones después del rojo observado.
Revisión DEEP de los cinco archivos y pasiva de seguridad del delta, sin
hallazgos accionables; Gitleaks8.30.1 del diff sin fugas. Resultados de CI y
Production posteriores a esta instantánea se registran en la PR de corrección.

## Build con adaptador real — 2026-11-18

Production7880818648 (main4aea3c1) también falló. El nuevo log aportado por el
propietario muestra Applying modifyConfig from Vercel y Running onBuildComplete
from Vercel antes del error. La señal NOW_BUILDER por sí sola no reproducía
esa vía: las dos correcciones anteriores cubrían formatos de JSON y builds
Next sin adaptador, no la salida del adaptador real.

Se inspeccionó el paquete oficial @vercel/next27.0.0, verificando la integridad
SHA512 del tar publicado. Su hook escribe Build Output API3 en .next/output,
incluidos config.json y .vc-config.json por función. El inventario de dependencias
está en filePathMap; no hay que exigir una traza NFT que ese build no emite.
Fuentes: [Build Output API](https://vercel.com/docs/build-output-api/configuration)
y [paquete oficial27.0.0](https://www.npmjs.com/package/@vercel/next/v/27.0.0).

La reproducción en Windows encontró una limitación de permisos de symlinks,
por lo que se hizo en Node24.19.0/Linux con Docker y volúmenes desechables.
Se usó un archivo del commit público4aea3c1, sin .env privados, claves ni datos
reales. El backend se deshabilitó y no se publicaron puertos. La herramienta
del proveedor se instaló solo en el entorno temporal, sin modificar dependencias
ni lock de Lexora. No se desplegó desde ese contenedor.

Antes del arreglo: el build real completó55 funciones Node24 y falló después
con Missing production server trace. No existía ninguna de las dos NFT raíz.
Después, repitiendo el mismo build con el guard corregido: exit0,55 funciones,
18684 referencias de assets revisadas, compiledNextReferences0. El postcheck
informa productionArtifactKind vercel-build-output-v3 y productionArtifactsChecked
true; productionTracesChecked es false porque se comprobaron mapas, no NFT.

El modo se obtiene de required-server-files.json, generado por Next, para no
aceptar salida vieja de un build con otro modo. Con adaptador se exige versión3,
rutas, funciones críticas de salud/cuenta/Auth/estudio, framework/version/runtime
del proyecto, handlers existentes dentro de su función y mapas no vacíos.
Se comprueban claves y valores de todos los mapas. Siguen bloqueándose nuevas
referencias a paquetes de globbing, y se conserva la excepción estrecha de la
copia compilada de Next vinculada al lock/config revisados. Next normal/mínimo
siguen exigiendo sus NFT. No se añade un modo sin inventario.

La CLI de regresión reproduce el error antes del arreglo. Después12 pruebas
del guard pasan, sin omisiones, con casos de versión desconocida, handler
inseguro/ausente, runtime/framework distintos, mapas vacíos o mal formados,
dependencia nueva en clave o valor, función crítica ausente y artefacto viejo
de adaptador que no puede satisfacer un build posterior sin adaptador.

**Límites:** estos inventarios de nombres y referencias son señales de regresión,
no un análisis exhaustivo de código inlined ni del servidor de imágenes que
gestiona Vercel. No se leen contenidos de assets ni se afirma corregida la CVE.
Las siete huellas, el plazo, la auditoría, los comandos y la revisión de src
permanecen intactos. Resultados de gate, CI y Production de este arreglo se
registran en la PR correspondiente.

Gate general posterior al arreglo: LEXORA_DB_TESTS=1 pnpm check exit0,
970 PASS+1 omisión privada; Nodebackup12/política12, formato/lint/tipos/
28 contrastes/build/NFT PASS. Revisión DEEP y pasiva de seguridad de los cinco
archivos modificados, sin hallazgos accionables en el alcance revisado.
Build mínimo posterior también exit0, con sus NFT y compiledNextFiles0.
Gitleaks8.30.1 del diff:23,16KB, exit0 y sin fugas. El paso de CI con
NOW_BUILDER se renombra como Next mínimo para distinguirlo del adaptador real;
la regresión de su formato se ejecuta por CLI dentro de las12 pruebas del guard.
