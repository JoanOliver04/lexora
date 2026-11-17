import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

/**
 * Marco visual común de las pantallas de autenticación: una tarjeta centrada,
 * con título y un pie opcional para los enlaces entre flujos.
 *
 * El `<h1>` es el título de la pantalla; cada página pasa el suyo ya traducido.
 */
export function AuthShell({
  title,
  children,
  footer,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const t = useTranslations("Visual");
  return (
    <main className="auth-composition">
      <section className="auth-story" aria-label={t("studySpace")}>
        <div>
          <p className="auth-statement">{t("authStatement")}</p>
          <p className="auth-story-description">{t("authDescription")}</p>
        </div>
        <p className="auth-story-footnote">{t("practiceNote")}</p>
      </section>
      <section className="auth-form-panel" aria-labelledby="auth-title">
        <h1 id="auth-title" className="text-3xl font-semibold tracking-tight text-balance">
          {title}
        </h1>
        {children}
        {footer ? (
          <div className="text-sm leading-relaxed text-(--color-ink-muted)">{footer}</div>
        ) : null}
      </section>
    </main>
  );
}
