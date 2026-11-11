"use client";
import { useEffect, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import {
  setRegistration,
  setInstallPrompt,
  reportInstallation,
  type InstallPrompt,
} from "./registration-store";

const online = () => navigator.onLine;
const serverOnline = () => true;
function subscribeConnection(listener: () => void) {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}
export function PwaRuntime() {
  const connected = useSyncExternalStore(subscribeConnection, online, serverOnline);
  const t = useTranslations("Pwa");
  useEffect(() => {
    // Capture once at the root, before the user navigates to settings.
    const available = (event: Event) => {
      if (!("prompt" in event) || typeof event.prompt !== "function") return;
      event.preventDefault();
      setInstallPrompt(event as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", available);
    window.addEventListener("appinstalled", reportInstallation);
    let active = true;
    const cleanup = () => {
      active = false;
      window.removeEventListener("beforeinstallprompt", available);
      window.removeEventListener("appinstalled", reportInstallation);
    };
    if (
      process.env.NODE_ENV !== "production" ||
      !window.isSecureContext ||
      !("serviceWorker" in navigator)
    ) {
      setRegistration("unavailable");
      return cleanup;
    }
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then(() => navigator.serviceWorker.ready)
      .then(() => {
        if (active) setRegistration("ready");
      })
      .catch(() => {
        if (active) setRegistration("unavailable");
      });
    return cleanup;
  }, []);
  if (connected) return null;
  return (
    <div
      role="status"
      className="border-b border-(--color-border-strong) bg-(--color-surface-sunken) px-4 py-3 text-sm leading-relaxed text-(--color-ink)"
    >
      <p className="mx-auto max-w-4xl">{t("offline")}</p>
    </div>
  );
}
