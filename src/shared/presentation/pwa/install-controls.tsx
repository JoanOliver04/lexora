"use client";
import { useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/presentation/components";
import {
  getRegistration,
  getServerRegistration,
  subscribeRegistration,
  getInstallPrompt,
  getServerInstallPrompt,
  setInstallPrompt,
  getReportedInstallation,
  getServerReportedInstallation,
} from "./registration-store";
const standalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;
function subscribeStandalone(listener: () => void) {
  const media = window.matchMedia("(display-mode: standalone)");
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}
const serverStandalone = () => false;
export function InstallControls() {
  const t = useTranslations("Pwa");
  const registration = useSyncExternalStore(
    subscribeRegistration,
    getRegistration,
    getServerRegistration,
  );
  const installed = useSyncExternalStore(subscribeStandalone, standalone, serverStandalone);
  const prompt = useSyncExternalStore(
    subscribeRegistration,
    getInstallPrompt,
    getServerInstallPrompt,
  );
  const reported = useSyncExternalStore(
    subscribeRegistration,
    getReportedInstallation,
    getServerReportedInstallation,
  );
  const [pending, setPending] = useState(false),
    [notice, setNotice] = useState<"accepted" | "dismissed" | "error" | null>(null);
  const busy = useRef(false);
  async function install() {
    if (!prompt || busy.current) return;
    busy.current = true;
    setPending(true);
    setInstallPrompt(null);
    setNotice(null);
    try {
      await prompt.prompt();
      setNotice((await prompt.userChoice).outcome);
    } catch {
      setNotice("error");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <section
      aria-labelledby="install-title"
      className="flex min-w-0 flex-col gap-4 rounded-(--radius-surface) border border-(--color-border) bg-(--color-surface) p-5 sm:p-7"
    >
      <h2 id="install-title" className="text-xl font-semibold">
        {t("title")}
      </h2>
      <p className="leading-relaxed text-(--color-ink-muted)">{t("description")}</p>
      {installed || reported ? (
        <p role="status">{t("installed")}</p>
      ) : (
        <>
          {prompt ? (
            <Button
              className="min-w-0 max-w-full self-start whitespace-normal"
              disabled={pending}
              onClick={install}
            >
              {t("install")}
            </Button>
          ) : (
            <p className="text-sm leading-relaxed text-(--color-ink-muted)">
              {t(registration === "unavailable" ? "unavailable" : "manual")}
            </p>
          )}
          {pending && <p role="status">{t("pending")}</p>}
          {notice && <p role={notice === "error" ? "alert" : "status"}>{t(notice)}</p>}
        </>
      )}
    </section>
  );
}
