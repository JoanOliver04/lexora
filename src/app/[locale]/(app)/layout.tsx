import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { ensureProfileForCurrentUser, getCurrentUserId } from "@/composition/identity";
import { isCurrentAccountDeletionPending } from "@/composition/account-deletion";
import { PendingAccountDeletion } from "./app/settings/pending-account-deletion";
import { getWorkspaceProfileForCurrentUser } from "@/composition/courses";
import { AccountTheme } from "@/shared/presentation/theme/account-theme";
import { getTranslations } from "next-intl/server";
import { WorkspaceFrame } from "@/shared/presentation/components/workspace-frame";
import { Button } from "@/shared/presentation/components";
import { logoutAction } from "@/app/[locale]/(auth)/actions";
import { ClientMessages } from "@/i18n/client-messages";
import { WorkspaceIcon } from "@/shared/presentation/components/workspace-destinations";

/**
 * Puerta del área autenticada.
 *
 * El proxy ya redirige a `login` con `next` cuando falta la sesión: eso es la
 * comodidad. **Esta** comprobación es la barrera de verdad —se ejecuta en el
 * servidor, en cada render— y por eso es una negación a secas: si se llega hasta
 * aquí sin sesión, algo ha fallado antes y no se confía en ningún `next` que
 * traiga el cliente. La navegación se reanuda desde `login`.
 *
 * Con sesión, se asegura el perfil (LEX-2.4): este es el punto de entrada que
 * ADR-005 dejó pendiente para cerrar la ventana «sesión sin fila de perfil».
 *
 * `force-dynamic` mantiene todo el subárbol fuera del renderizado estático: una
 * página privada no debe quedar cacheada.
 */
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const userId = await getCurrentUserId();
  if (!userId) {
    redirect(`/${locale}/login`);
  }

  const [profile, t] = await Promise.all([
    getWorkspaceProfileForCurrentUser(),
    getTranslations("Auth"),
  ]);
  if (!profile) {
    if (await isCurrentAccountDeletionPending()) {
      return (
        <ClientMessages namespaces={["AccountDeletion"]}>
          <PendingAccountDeletion locale={locale} />
        </ClientMessages>
      );
    }
    if (!(await ensureProfileForCurrentUser())) redirect(`/${locale}/login`);
  }
  const theme = profile?.theme ?? "system";
  return (
    <>
      {(theme === "light" || theme === "dark" || theme === "system") && (
        <AccountTheme preference={theme} />
      )}
      <ClientMessages namespaces={["Commands", "Navigation"]}>
        <WorkspaceFrame
          courseTitle={profile?.course?.title}
          logout={
            <form action={logoutAction}>
              <input type="hidden" name="locale" value={locale} />
              <Button
                type="submit"
                variant="secondary"
                className="workspace-logout"
                aria-label={t("logout")}
                title={t("logout")}
              >
                <WorkspaceIcon path="M10 17l5-5-5-5m5 5H3m10-8h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5" />
                <span>{t("logout")}</span>
              </Button>
            </form>
          }
        >
          {children}
        </WorkspaceFrame>
      </ClientMessages>
    </>
  );
}
