# Picomatch — excepción temporal de alcance revisado

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
- SHA256 con finales LF del lock, pnpm-workspace, next.config, Vitest, ESLint,
  package.json y vercel.json, incluidos los comandos de compilación.
  Cualquier cambio requiere revisar y registrar otra vez el alcance.
- Referencias nuevas a paquetes de globbing en src, como señal conservadora.
- Que el registro aún anuncie4.0.7 como latest; otro valor o una respuesta
  fallida detienen la excepción para volver a revisar y actualizar.

El propio pnpm build exige la política antes de compilar y revisa después las
NFT: exige la traza del servidor, rechaza nuevos
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
