"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { Brand } from "./brand";
import { WorkspaceCommands } from "./workspace-commands";
import {
  WorkspaceIcon,
  workspaceDestinations,
  isWorkspaceDestinationActive,
} from "./workspace-destinations";

export function WorkspaceFrame({ children, logout }: { children: ReactNode; logout: ReactNode }) {
  const t = useTranslations("Navigation");
  const pathname = usePathname();
  if (pathname === "/onboarding") return children;

  function navigation(mobile: boolean) {
    return workspaceDestinations
      .filter((_, index) => !mobile || index < 5)
      .map((item) => {
        const active = isWorkspaceDestinationActive(pathname, item.href);
        return (
          <Link
            key={item.key}
            href={item.href}
            className="workspace-link"
            aria-current={active ? "page" : undefined}
          >
            <WorkspaceIcon path={item.path} />
            <span>{t(item.key)}</span>
          </Link>
        );
      });
  }

  return (
    <div className="workspace-frame" tabIndex={-1}>
      <a className="skip-link" href="#workspace-content">
        {t("skip")}
      </a>
      <aside className="workspace-sidebar">
        <Brand href="/app" />
        <nav aria-label={t("primary")}>{navigation(false)}</nav>
        <p className="workspace-note">{t("note")}</p>
      </aside>
      <div className="workspace-body">
        <header className="workspace-topbar">
          <Brand href="/app" className="workspace-mobile-brand" />
          <span className="workspace-desktop-label">
            {t(
              workspaceDestinations.find((item) =>
                isWorkspaceDestinationActive(pathname, item.href),
              )?.key ?? "space",
            )}
          </span>
          <div className="workspace-header-actions">
            <WorkspaceCommands />
            {logout}
          </div>
          <nav className="workspace-tools" aria-label={t("tools")}>
            <Link href="/import">{t("import")}</Link>
            <Link href="/app/history">{t("history")}</Link>
          </nav>
        </header>
        <div id="workspace-content" className="workspace-content" tabIndex={-1}>
          {children}
        </div>
      </div>
      <nav className="workspace-bottom-nav" aria-label={t("primary")}>
        {navigation(true)}
      </nav>
    </div>
  );
}
