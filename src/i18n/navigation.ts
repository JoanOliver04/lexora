import { createNavigation } from "next-intl/navigation";
import { createElement, type ComponentProps } from "react";

import { routing } from "./routing";

/**
 * Envoltorios de navegación conscientes del idioma.
 *
 * Se usan **estos** en lugar de los de `next/link` y `next/navigation`: añaden
 * solos el prefijo de idioma, de modo que un enlace a `/ajustes` lleva a
 * `/es/ajustes` o a `/en/ajustes` según corresponda.
 *
 * Usar el `Link` de Next.js directamente en una ruta traducida saca al usuario
 * de su idioma sin avisar.
 */
const {
  Link: LocalizedLink,
  redirect,
  usePathname,
  useRouter,
  getPathname,
} = createNavigation(routing);

// Fetch account pages on navigation intent. Viewport prefetches waste private
// queries and can fail in WebKit when the connection drops during study.
export function Link({ prefetch = false, ...props }: ComponentProps<typeof LocalizedLink>) {
  return createElement(LocalizedLink, { ...props, prefetch });
}

export { redirect, usePathname, useRouter, getPathname };
