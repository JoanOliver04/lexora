import { createNavigation } from "next-intl/navigation";

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
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
