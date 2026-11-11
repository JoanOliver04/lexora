import { THEME_STORAGE_KEY, themePreferences, type ThemePreference } from "./theme";

/**
 * Almacen externo para la preferencia de tema.
 *
 * Se modela como almacen externo, y no como estado de React, porque eso es lo
 * que es: vive en `localStorage`, puede cambiarla otra pestana, y el servidor no
 * puede conocerla. `useSyncExternalStore` esta hecho exactamente para esto y
 * evita el patron de «leer en un efecto y llamar a setState», que provoca un
 * render en cascada y un parpadeo del valor por defecto.
 */

const listeners = new Set<() => void>();
let lastPreference: ThemePreference = "system";
let volatilePreference: ThemePreference | null = null;

function notify() {
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  // El evento `storage` solo se dispara en las **otras** pestanas. Cambiar el
  // tema en una y volver a esta deberia encontrarlo ya aplicado.
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) {
      volatilePreference = null;
      lastPreference = themePreferences.includes(event.newValue as ThemePreference)
        ? (event.newValue as ThemePreference)
        : "system";
      document.documentElement.dataset["theme"] = resolveTheme(getSnapshot());
      notify();
    }
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function getSnapshot(): ThemePreference {
  if (volatilePreference !== null) return volatilePreference;
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    lastPreference = themePreferences.includes(stored as ThemePreference)
      ? (stored as ThemePreference)
      : "system";
    return lastPreference;
  } catch {
    // `localStorage` lanza excepcion con las cookies bloqueadas o en modo
    // privado restrictivo. Conserva la ultima eleccion de esta pestana.
    return lastPreference;
  }
}

/**
 * En el servidor no hay preferencia que leer. Devolver `system` mantiene el
 * marcado del servidor y el del cliente iguales; el tema real ya lo ha aplicado
 * `ThemeScript` sobre el elemento raiz antes del primer pintado.
 */
export function getServerSnapshot(): ThemePreference {
  return "system";
}

export function resolveTheme(preference: ThemePreference): "light" | "dark" {
  if (preference !== "system") return preference;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function setPreference(preference: ThemePreference): void {
  lastPreference = preference;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
    volatilePreference = null;
  } catch {
    // Sin almacenamiento, el tema dura lo que la pestana. Es preferible a no
    // dejar cambiarlo. Lecturas que aun funcionen no deben recuperar un valor viejo.
    volatilePreference = preference;
  }
  document.documentElement.dataset["theme"] = resolveTheme(preference);
  notify();
}
