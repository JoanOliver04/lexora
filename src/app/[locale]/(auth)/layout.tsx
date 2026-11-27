import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { isPrivateAccessEnabled } from "@/composition/deployment";
import { ClientMessages } from "@/i18n/client-messages";

import { ThemeToggle } from "@/shared/presentation/theme/theme-toggle";

import { LocaleSwitcher } from "../locale-switcher";
import { Link } from "@/i18n/navigation";
import { Brand } from "@/shared/presentation/components/brand";

/**
 * Marco de las rutas de autenticación. Mantiene a mano el cambio de idioma y de
 * tema —quien llega a registrarse puede querer la interfaz en el otro idioma— y
 * deja el contenido a cada pantalla.
 */
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("Auth");
  return (
    <div className="flex min-h-screen flex-col">
      <header className="auth-topbar">
        <Brand />
        <div className="flex flex-wrap items-end gap-4">
          <LocaleSwitcher />
          <ThemeToggle />
        </div>
      </header>
      <div className="flex flex-1 flex-col">
        {isPrivateAccessEnabled() ? (
          <ClientMessages namespaces={["Auth"]}>{children}</ClientMessages>
        ) : (
          <main className="mx-auto w-full max-w-lg px-4 py-12">
            <h1 className="text-3xl font-semibold">{t("preview.title")}</h1>
            <p className="mt-4 text-(--color-ink-muted)">{t("preview.description")}</p>
            <Link
              href="/demo"
              className="mt-4 inline-flex min-h-11 items-center text-(--color-accent) underline underline-offset-4"
            >
              {t("tryDemo")}
            </Link>
          </main>
        )}
      </div>
    </div>
  );
}
