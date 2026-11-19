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

export function WorkspaceFrame({
  children,
  logout,
  courseTitle,
}: {
  children: ReactNode;
  logout: ReactNode;
  courseTitle?: string | undefined;
}) {
  const t = useTranslations("Navigation");
  const pathname = usePathname();
  if (pathname === "/onboarding") return children;

  function navigation(mobile: boolean) {
    return workspaceDestinations
      .filter((_, index) => !mobile || index < 5)
      .map((item) => {
        const active = isWorkspaceDestinationActive(pathname, item.href);
        const short = mobile && (item.key === "decks" || item.key === "concepts");
        return (
          <Link
            key={item.key}
            href={item.href}
            className="workspace-link"
            aria-current={active ? "page" : undefined}
            aria-label={short ? t(item.key) : undefined}
          >
            <WorkspaceIcon path={item.path} />
            <span>{short ? t(`${item.key}Short`) : t(item.key)}</span>
          </Link>
        );
      });
  }

  return (
    <div
      className="workspace-frame"
      tabIndex={-1}
      data-study-session={pathname.startsWith("/app/study/") || undefined}
      data-import-flow={pathname === "/import" || undefined}
      data-deck-detail={pathname.startsWith("/decks/") || undefined}
      data-course-management={pathname === "/app/courses" || undefined}
    >
      <a className="skip-link" href="#workspace-content">
        {t("skip")}
      </a>
      <aside className="workspace-sidebar">
        <Brand href="/app" />
        <nav aria-label={t("primary")}>{navigation(false)}</nav>
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
          <div className="workspace-course-and-tools">
            {courseTitle && (
              <Link
                href="/app/courses"
                className="inline-flex min-h-11 min-w-0 max-w-full shrink-0 items-center gap-2 rounded-(--radius-control) border border-(--color-border-strong) bg-(--color-surface) px-3 text-sm font-semibold text-(--color-ink) hover:bg-(--color-surface-sunken) [&>svg]:size-4 [&>svg]:shrink-0"
                aria-current={pathname === "/app/courses" ? "page" : undefined}
                aria-label={t("courseSwitcher", { course: courseTitle })}
                title={courseTitle}
              >
                <span className="max-w-[min(36vw,12rem)] truncate">{courseTitle}</span>
                <WorkspaceIcon path="m6 9 6 6 6-6" />
              </Link>
            )}
            <nav className="workspace-tools" aria-label={t("tools")}>
              {workspaceDestinations.slice(5).map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  aria-current={
                    isWorkspaceDestinationActive(pathname, item.href) ? "page" : undefined
                  }
                >
                  {t(item.key)}
                </Link>
              ))}
            </nav>
          </div>
          <div className="workspace-header-actions">
            <WorkspaceCommands />
            {logout}
          </div>
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
