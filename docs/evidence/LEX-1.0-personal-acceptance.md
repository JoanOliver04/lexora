# Aceptación de Lexora1.0 personal

Revisión de cierre:2026-11-12. Alcance de [ADR-008](../adrs/008-personal-use.md).
La entrega permite operar la cuenta existente y estudiar con datos propios;
mantiene cerrado el registro. La demo pública, captación, portfolio, SMTP
dedicado y Sentry no se presentan como implementados ni condicionan este cierre.
No se han borrado ni restaurado cuentas reales para obtener evidencia.

## Trazabilidad funcional

| Comportamiento entregado | Evidencia ejecutada y controles mantenidos |
|---|---|
| Acceso existente, salida, recuperación y onboarding | auth/onboarding/identity-a11y E2E; modo personal prueba login con registro cerrado; consulta pública de Auth confirma altas deshabilitadas |
| Mazos, conceptos, competencias, etiquetas, búsqueda y archivado | library/practice-items/library-options E2E; aislamiento A/B/anon SQL; [páginas y recuentos completos](LEX-9-library-scale.md), [opciones](LEX-9-library-options.md) y [recuperación de borradores](LEX-3.13.md) |
| TXT/CSV, mapeo, tags, inversas, duplicados y reanudación | import-preview/recovery/isolation E2E e integración real; [medición hasta10.000 filas](LEX-9-import-performance.md); originales privados intactos y fuera de Git |
| Hoy, revelado, cuatro valoraciones y calendario por competencia | [contrato FSRS](../FSRS.md); tests con reloj congelado, medianoche/DST, idempotencia y conflicto; study-review/short-steps/lifecycle/recovery/keyboard E2E |
| Progreso después de iniciar sesión en otra pantalla | [contextos desktop/móvil independientes](LEX-9-compatibility.md), sin compartir cookies iniciales; DB y UI pasan de0 a1 log solo después de confirmar |
| Historial, estadísticas, denominadores y previsión | history-statistics E2E y tests de integración; [contrato de métricas](../STATISTICS.md), tablas y alternativa textual a gráficos |
| Preferencias personales y por curso | preferences E2E e integración: persistencia, conflicto entre pestañas, idioma/zona/tema/límites; reloj del servidor |
| Exportación y borrado propio | [JSON/CSV e integridad](../DATA_EXPORT.md), pruebas de precisión/Unicode/fórmulas y cooldown; E2E exporta antes de borrar únicamente cuentas sintéticas locales; [ciclo de datos](../DATA_LIFECYCLE.md) |
| Instalación y recuperación de errores de red | PWA/update E2E; [aceptación física del propietario](LEX-9-installation.md); caché pública y fallback neutral, sin cola offline |
| ES/EN, claro/oscuro, teclado y pantallas estrechas | [216 análisis A/AA](LEX-9-accessibility.md), contraste28 pares, reflow320px/texto200%, Chromium y matriz Firefox/WebKit |

## Calidad, seguridad y operación

El gate local con integración real termina930 PASS+1 omisión condicional,
Node12 PASS y formato/lint/tipos/contraste/build correctos. La omisión corresponde
al directorio opcional de material privado, no a un flujo público desactivado.
La suite dirigida final da Chromium8 y Firefox/WebKit8 PASS; modo cerrado4 y
Preview4 PASS. Las nueve regresiones de backend rechazan destinos remotos antes
de crear cuentas y verifican configuración parcial inmutable. Los checks remotos
del commit exacto siguen siendo condición para integrar y publicar esta versión.

La base funcional está publicada por PR114/head `1d9cd93`: CI43210753351,
tres SUCCESS,198 E2E PASS+4 omisiones, Firefox/WebKit8 y cerrado4/Preview4 PASS
sin retries; SQL592 e integración53 PASS. Merge `a93db6c`, deployment7736415994
Production SUCCESS, health200 app/database true y cabeceras verificadas. El cierre
1.0.0 añade metadatos de versión y documentación, sin otra migración o proveedor.

El esquema consta de24 migraciones y18 tablas públicas con RLS. La CI reaplica
desde cero, prueba SQL/aislamiento y compara los tipos generados. La aplicación
usa clave pública y sesión de usuario. El único borrado privilegiado está
limitado al UID propio y a una sesión reciente con confirmación/MFA apropiada.
Cuotas, límites de cuerpo/origen y errores depurados están en
[SECURITY](../SECURITY.md) y [ANTI_ABUSE](../ANTI_ABUSE.md).

El escaneo completo previo al cierre revisa168 commits sin secretos no
autorizados; el snapshot público670 archivos también está limpio. Hay dos
fingerprints históricos exactos documentados: clave publicable local y cadena
ficticia no funcional, sin exclusiones de archivos o reglas. La auditoría de
dependencias del12/11 da0 en todas las severidades. Las revisiones independientes
de corrección, seguridad y mantenibilidad del bloque funcional están cerradas.

Vercel publica solo main; una Preview manual no puede alcanzar el backend
personal. HTTPS, health, CSP con nonce por respuesta, no-store y cabeceras se
comprueban después del despliegue. [El laboratorio](LEX-9-web-lab.md) registra
36 cargas con CLS0 y cinco guardados/cinco logs; son mediciones locales, no
métricas de campo ni una garantía de latencia para todos los dispositivos.

La [recuperación](../BACKUP_RECOVERY.md) se ensayó sobre bases locales desechables:
24 migraciones/46 tablas totales, Auth, login nuevo, TOTP AAL2, historial e
aislamiento. Existe un dump real cifrado y verificado, privado y fuera de Git.
No se restauró sobre producción. La copia externa del archivo y la custodia
separada de su clave siguen siendo una acción del propietario.

## Límites declarados

- La aceptación de instalación móvil/escritorio y zoom/lector móvil procede de
  los informes expresos del propietario. No identifica versiones ni acredita
  toda combinación física o una certificación integral de WCAG.
- No hay estudio offline, evaluación de pronunciación, IA ni audio generado.
- El backup es manual; no se promete RPO/RTO ni copia externa automatizada.
- La protección de contraseñas filtradas aparece como aviso del plan alojado.
  No se contrató una ampliación. Los avisos informativos de índices no se
  convierten en una recomendación de añadir o eliminar índices sin medición.
- Q-005/Q-006 conservan sus decisiones históricas abiertas, con las opciones
  actuales ya implementadas: profesional como categoría y archivado sin cascada.
  No bloquean el uso personal y no se simula una nueva aprobación del propietario.
- Reordenar mazos puede dejar un orden parcial si una escritura falla. No afecta
  al contenido, a los estados FSRS ni a los logs. La interfaz ofrece opciones del
  curso actual; los enlaces históricos no tienen una garantía general de curso
  común ante IDs manipulados o DML directo. La FK exige el mismo dueño.
- La recuperación conserva Supabase Auth existente; se verifican el flujo local
  y sus redirects, sin atribuir entrega de correo real en producción.
- La licencia sigue sin decidir: el repositorio público no concede por ello
  permiso de reutilización. No se ha publicado una campaña ni una entrada de portfolio.

La estabilización personal acreditada cubre los gates, los despliegues comprobados y los
informes recibidos. No se inventa un periodo de observación, SLA o ausencia de
errores de todo el tráfico. [STATUS](../STATUS.md) identifica la entrega vigente;
los incidentes nuevos deben tratarse como correcciones, separados de mejoras futuras.
