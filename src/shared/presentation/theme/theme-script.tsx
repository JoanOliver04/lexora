import { THEME_STORAGE_KEY } from "./theme";

/**
 * Aplica el tema **antes del primer pintado**.
 *
 * Sin esto, el navegador pinta el tema claro, React hidrata, y solo entonces se
 * aplica el oscuro: un destello blanco en cada carga que, a oscuras, resulta
 * agresivo. No es un detalle estetico.
 *
 * Tiene que ser un script sincrono en el `<head>`. Un efecto de React llega
 * tarde por definicion: se ejecuta despues de pintar.
 *
 * Va envuelto en try/catch porque `localStorage` lanza una excepcion cuando las
 * cookies de terceros estan bloqueadas o el navegador esta en modo privado
 * restrictivo. Si falla, se queda el tema claro, que es el valor por defecto del
 * CSS: la pagina se ve bien igualmente.
 */
export function ThemeScript() {
  const script = `
(function () {
  try {
    var stored = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var resolved = stored === "dark" || (stored !== "light" && prefersDark) ? "dark" : "light";
    document.documentElement.dataset.theme = resolved;
  } catch (error) {
    document.documentElement.dataset.theme = "light";
  }
})();
`.trim();

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
