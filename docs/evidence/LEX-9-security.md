# LEX-9 — Hardening de despliegue

Base `257765f` (PWA de PR #106), rama `feat/v1-security-hardening`. Sin migraciones,
nuevas dependencias de aplicación, cambios de plan o datos reales de prueba.
La autorización del propietario permite commits/despliegues progresivos.

## Revisión y correcciones

Revisión estática acotada a configuración/cookies/entorno/CI y rutas de fuga,
con lentes independientes y mapa compartido. No es auditoría exhaustiva ni pentest.
Matriz inicial: 0 críticos, 0 altos, 0 medios y 1 bajo confirmado (CWE-532).
sourceReference mayor de 500 llegaba al CHECK; la causa PostgREST podía contener
la fila y alcanzar logs. Se elimina la causa/detalle del proveedor, se limitan
los ocho logs de biblioteca a kind y se valida el campo antes de escribir.
La regresión inspect(Error) y los límites 500/501 fallarían con la implementación
anterior. Revalidación independiente confirma el cierre en la fuente.

CSP/cookies Secure/CI fijada se registran como refuerzos: su ausencia no se presentó
como un XSS explotado, clickjacking demostrado o compromiso de un action remoto.
Preview Git ya estaba desactivada; la barrera runtime añade protección frente
a despliegues manuales mal configurados, sin afirmar una exposición previa.

Revisión del diff con tres lentes: 49 archivos iniciales y tres de clave pública.
Un P2 detectado: los clientes con caché SW v1 no renovarían cabeceras por un cambio
solo en next.config. Se incrementa a v2 y se prueba la actualización en la misma
URL desde el worker exacto publicado, servido en un origen loopback efímero.
La regresión espera controllerchange, verifica CSP/antiframes/nosniff de las
respuestas cacheadas, conserva una caché ajena y navega offline. Tres lentes
incrementales confirman el cierre en la fuente, sin otros hallazgos comunicados.

## Comprobaciones ejecutadas

- Gate final con integración real local y guardia de clave incluida: 881 PASS +
  1 omitida; formato/lint/tipos/contraste/build PASS. Incluye el SW v2 y las
  regresiones finales. Ninguna migración ni regeneración de tipos de DB necesaria.
- CSP/navegador: 6 PASS, sin retries, Chromium escritorio y perfil Poco F5. Un
  script insertado en el HTML por el parser se bloquea; el bootstrap de tema y la
  hidratación siguen activos. Nonces distintos, cabeceras en recursos/API/404
  con punto y renovación persistida tras marcar caducado el expires_at local de
  una sesión sintética. No se esperó una hora a la expiración real del JWT.
- Preview simulado con build propio: 4 PASS ES/EN×dos perfiles. Nueve rutas,
  sin formularios personales; APIs privadas 403, callback al login y health 503
  con database:false. Unitarios comprueban que no se crean clientes ni se llama
  a fetch antes de denegar, incluso con override de registro.
- `pnpm audit --json`: exit 0, todas las severidades 0; sin cambios de lockfile.
- Suite completa antes del bump SW: 160 PASS + 4 omisiones condicionales privadas,
  sin retries, 8,8 minutos; build cerrado 4 PASS. Después del bump: 12 dirigidas
  PASS (PWA/upgrade/CSP). Se añade espera explícita del controlador y se aíslan
  las ediciones sintéticas de cookies de los prefetches; repetición 8 PASS,
  sin avisos de chunks incompletos. No se ocultaron esos avisos con filtros.
- Gitleaks 8.30.1 Windows: descarga oficial y SHA256
  `d29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e`
  contrastado con checksum de la misma release; version exit 0. Árbol e historial
  alcanzable, 155 commits: un falso positivo, publishable local de CI. Exclusión
  exacta documentada; repetición exit 0 en ambos. Control positivo sintético exit 1.
  Los informes privados están redactados y no se versionan.
- Bundle generado del navegador `.next/static`: Gitleaks exit 0, cero hallazgos.
  Esta cobertura es adicional al árbol e historial; no incluye otros artefactos.
- CI comprueba además el binario Linux con SHA256
  `551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb`,
  obtenido del checksum oficial, y versión 8.30.1 antes de ejecutar.

La primera pasada dirigida tuvo dos fallos por un nombre de heading inglés mal
escrito en el test; se corrigió al texto real Sign in to Lexora y la pasada
posterior de seis pruebas fue verde. No se cambió el producto ni se relajó el
bloqueo de scripts para resolverlo.

PR #107 integrado como `e9042ed53babd9dc173c068136633936ed1edc8e`.
CI43085775495 con los tres trabajos SUCCESS, incluidos scanner Linux/audit,
DB y navegador con builds cerrado/Preview. Deployment7719696781 SUCCESS.
Health canónico200 app/database true, nonces distintos, HTML no-store,
DENY/nosniff, SWv2 y CSP estática del fallback comprobados. Smoke HTTPS con
navegador anónimo nuevo: tema oscuro, scripts con nonce y cero errores o
violaciones CSP. Ninguna cuenta real utilizada para pruebas destructivas.

## Límites

No se probaron ataques/cargas contra cuentas reales ni se borró ninguna.
Los tests crean usuarios sintéticos solo en Supabase local. No se confirman
instalación física, lector real ni zoom nativo. No se inspeccionan IAM/WAF/logs
del proveedor ni se certifica seguridad absoluta. La protección contra contraseñas
filtradas del plan alojado no se habilita contratando un plan nuevo.
Contrato [DEPLOYMENT_SECURITY](../DEPLOYMENT_SECURITY.md).
