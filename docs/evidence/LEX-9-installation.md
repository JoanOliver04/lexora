# Instalación y aceptación física

Informe del propietario, 2026-11-11/12; no es una ejecución remota del agente.

Joan confirma que instaló Lexora en su móvil, la cerró y volvió a abrirla
correctamente. Confirma también que zoom/texto ampliado y lector de pantalla
real funcionaron sin problemas. El 12/11 confirma que la aplicación instalada
en escritorio se vuelve a abrir correctamente desde su icono.

No se atribuyen dispositivo, navegador/versión, tecnología asistiva concreta,
orientación, idioma ni commit servido que no haya indicado. No se convierte
este informe en una certificación completa de accesibilidad.

Las pruebas automatizadas de manifest, caché exclusivamente pública, fallback
offline, captura del evento de instalación y activación/claim de actualizaciones
están en `pwa.spec.ts` y `pwa-upgrade.spec.ts`. PR112 conserva esos controles
en su suite Chromium:184 PASS y4 omisiones condicionadas, CI43193476879.

El agente identificó una aplicación de Chrome llamada Lexora. La herramienta
de escritorio detuvo la inspección al no poder verificar su URL con suficiente
confianza; no acreditó con ella cierre/reapertura ni contenido de la ventana.
La aceptación de instalación procede de las confirmaciones expresas de Joan.
