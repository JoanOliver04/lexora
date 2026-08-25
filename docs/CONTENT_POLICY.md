# Política de contenido

Qué puede vivir en este repositorio y qué no. **El repositorio es público:** todo
lo que se confirma queda visible de forma permanente, también en los forks,
aunque después se borre.

---

## 1. La regla

| Tipo de contenido | Dónde vive | ¿Versionado? |
|---|---|---|
| Material de estudio privado del propietario | Su cuenta en la aplicación, y `docs/no_visible_en_github/` en local | **No** |
| Fixtures de test | `tests/fixtures/` | Sí, si son originales |
| Contenido de la demo pública | Semillas del repositorio | Sí, si es original o de licencia compatible |
| Especificación y roadmap | `docs/no_visible_en_github/` | **No** |
| Resto de la documentación | `docs/` | Sí |

---

## 2. Material privado de estudio

El propietario tiene alrededor de un millar de tarjetas propias, preparadas para
otra herramienta. Sirven como conjunto de prueba real de la importación.

- **Se importan en su cuenta.** No se incluyen como semilla del repositorio.
- No se usan como fixture de test, ni siquiera parcialmente.
- No aparecen en registros de error, en informes de evidencia ni en capturas.
- Las muestras de filas en los errores de importación se acotan y se sanean.
- Al medir el rendimiento de la importación se publica el recuento, nunca el contenido.

El motivo no es solo de privacidad. Ese material procede en parte de clases y
libros de terceros, y no consta que pueda redistribuirse.

---

## 3. Fixtures de test

Deben ser **originales**, escritas para el proyecto, y lo bastante pequeñas para
revisarse de un vistazo.

Su función es cubrir la forma del archivo, no enseñar inglés: codificación,
separadores, comillas, líneas de directiva, etiquetas jerárquicas, filas
inválidas, campos vacíos y caracteres problemáticos. Diez filas artificiales
cubren más casos límite que mil filas reales.

---

## 4. Contenido de la demo

La demo pública debe permitir probar el flujo principal sin registro.

- Frases y vocabulario **originales**, o con licencia compatible verificada y anotada.
- Sin datos personales de nadie.
- Sin material de libros de texto, exámenes oficiales, cursos o bancos de vocabulario ajenos.
- Su única finalidad es enseñar cómo funciona el producto.

---

## 5. Prohibido en el repositorio

- Libros, exámenes, audios o vocabulario copiados de fuentes sin permiso.
- Datos personales de cualquiera, propios incluidos.
- Credenciales, claves, tokens o cadenas de conexión, aunque estén caducados.
- Volcados de base de datos con contenido real.
- Capturas que muestren datos privados o valores de configuración.

---

## 6. Antes de confirmar

Un archivo confirmado una vez ya no se puede retirar del historial ni de los
forks. Por eso la comprobación es previa, no posterior.

1. `git status` antes de cada commit: mirar **qué** se está añadiendo, no solo cuántos archivos.
2. Ante la duda sobre el origen de un contenido, no se añade.
3. Un archivo nuevo en `tests/fixtures/` o en las semillas exige responder de dónde salió.
4. Las salidas de comandos que se peguen en un informe de evidencia se revisan antes.

Si algo privado llega a confirmarse: avisar al propietario de inmediato. Reescribir
el historial es posible, pero deja de ser suficiente en cuanto alguien ha clonado
o el contenido se ha indexado, y en ese caso la respuesta correcta es rotar lo que
haya que rotar.

---

## 7. Licencia

Todavía sin decidir. Hasta que exista un archivo `LICENSE`, se reservan todos los
derechos: nadie puede reutilizar el código legalmente.

La decisión llega antes de la publicación de la V1 y depende de si el producto
tendrá explotación comercial. No se añade una licencia por defecto.

---

## 8. Quién decide

Publicar, cambiar la visibilidad del repositorio, elegir licencia, incorporar
contenido de terceros y abrir registros públicos son decisiones del propietario.
Un agente las registra como pregunta abierta; no las toma.
