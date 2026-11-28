import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { PublicPolicyLinks } from "../../public-policy-links";
import { StudioCredit } from "../../studio-credit";

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
  demoLabel,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  demoLabel?: string;
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
        {demoLabel && (
          <Link
            href="/demo"
            className="inline-flex min-h-11 items-center self-start text-sm font-semibold text-(--color-accent) underline underline-offset-4"
          >
            {demoLabel}
          </Link>
        )}
        <footer className="space-y-2">
          <PublicPolicyLinks />
          <StudioCredit />
        </footer>
      </section>
    </main>
  );
}
