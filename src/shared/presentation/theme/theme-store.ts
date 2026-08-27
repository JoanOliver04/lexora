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

function notify() {
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  // El evento `storage` solo se dispara en las **otras** pestanas. Cambiar el
  // tema en una y volver a esta deberia encontrarlo ya aplicado.
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY) notify();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function getSnapshot(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return themePreferences.includes(stored as ThemePreference)
      ? (stored as ThemePreference)
      : "system";
  } catch {
    // `localStorage` lanza excepcion con las cookies bloqueadas o en modo
    // privado restrictivo. Sin almacenamiento, seguir al sistema.
    return "system";
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
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Sin almacenamiento, el tema dura lo que la pestana. Es preferible a no
    // dejar cambiarlo.
  }
  document.documentElement.dataset["theme"] = resolveTheme(preference);
  notify();
}
