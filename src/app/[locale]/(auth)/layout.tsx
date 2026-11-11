import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { isPrivateAccessEnabled } from "@/composition/deployment";

import { ThemeToggle } from "@/shared/presentation/theme/theme-toggle";

import { LocaleSwitcher } from "../locale-switcher";

/**
 * Marco de las rutas de autenticación. Mantiene a mano el cambio de idioma y de
 * tema —quien llega a registrarse puede querer la interfaz en el otro idioma— y
 * deja el contenido a cada pantalla.
 */
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("Auth");
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-5xl flex-wrap items-end justify-end gap-4 px-4 py-4 sm:px-6">
        <LocaleSwitcher />
        <ThemeToggle />
      </header>
      <div className="flex flex-1 flex-col">
        {isPrivateAccessEnabled() ? (
          children
        ) : (
          <main className="mx-auto w-full max-w-lg px-4 py-12">
            <h1 className="text-3xl font-semibold">{t("preview.title")}</h1>
            <p className="mt-4 text-(--color-ink-muted)">{t("preview.description")}</p>
          </main>
        )}
      </div>
    </div>
  );
}
