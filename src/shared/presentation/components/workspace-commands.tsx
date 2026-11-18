"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { WorkspaceIcon, workspaceDestinations } from "./workspace-destinations";

const addPath = "M12 4v16M4 12h16";
const serverReady = () => false;

/** Readiness follows the installed listener, rather than an earlier hydration render. */
function createShortcutStore() {
  let active = false;
  return {
    getSnapshot: () => active,
    subscribe(notify: () => void, toggle: () => void) {
      function shortcut(event: KeyboardEvent) {
        if (
          event.defaultPrevented ||
          event.isComposing ||
          event.repeat ||
          event.altKey ||
          event.shiftKey
        )
          return;
        if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "k") return;
        event.preventDefault();
        toggle();
      }
      document.addEventListener("keydown", shortcut);
      active = true;
      notify();
      return () => {
        active = false;
        document.removeEventListener("keydown", shortcut);
      };
    },
  };
}

/** Only searches public route labels, never private library content. */
function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function WorkspaceCommands() {
  const t = useTranslations("Commands");
  const navigation = useTranslations("Navigation");
  const pathname = usePathname();
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const openedPath = useRef<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const firstLink = useRef<HTMLAnchorElement>(null);
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const commands = isOpen
    ? [
        { href: "/concepts#new-concept", key: "newConcept", label: t("newConcept"), path: addPath },
        { href: "/decks#new-deck", key: "newDeck", label: t("newDeck"), path: addPath },
        { href: "/app/study", key: "study", label: t("study"), path: "m9 4 11 8-11 8V4Z" },
        ...workspaceDestinations.map((item) => ({ ...item, label: navigation(item.key) })),
      ]
    : [];
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const matches = commands.filter((item) => {
    const text = normalize(`${item.label} ${t(`hints.${item.key}`)}`);
    return words.every((word) => text.includes(word));
  });

  const open = useCallback(() => {
    if (!dialog.current || document.querySelector("dialog[open]")) return;
    setQuery("");
    openedPath.current = window.location.pathname;
    dialog.current.showModal();
    setIsOpen(true);
    input.current?.focus();
  }, []);

  const toggle = useCallback(() => {
    if (dialog.current?.open) dialog.current.close();
    else open();
  }, [open]);
  const [shortcut] = useState(createShortcutStore);
  const subscribe = useCallback(
    (notify: () => void) => shortcut.subscribe(notify, toggle),
    [shortcut, toggle],
  );
  const ready = useSyncExternalStore(subscribe, shortcut.getSnapshot, serverReady);

  useEffect(() => {
    // A shortcut may open the dialog after navigation but before this effect.
    // Close only a dialog carried over from the previous URL.
    if (dialog.current?.open && openedPath.current !== window.location.pathname) {
      dialog.current.close();
    }
  }, [pathname]);

  return (
    <>
      <button
        type="button"
        className="command-trigger"
        title={t("trigger")}
        aria-keyshortcuts="Control+K Meta+K"
        aria-haspopup="dialog"
        aria-controls={id}
        disabled={!ready}
        onClick={open}
      >
        <WorkspaceIcon path="m21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" />
        <span className="command-trigger-full">{t("trigger")}</span>
        <span className="command-trigger-short" aria-hidden="true">
          {t("triggerShort")}
        </span>
        <kbd aria-hidden="true">Ctrl/⌘ K</kbd>
      </button>
      <dialog
        ref={dialog}
        id={id}
        className="command-dialog"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-hint`}
        onClose={() => {
          if (dialog.current?.open) return;
          setIsOpen(false);
          setQuery("");
        }}
      >
        <header className="command-heading">
          <h2 id={`${id}-title`}>{t("title")}</h2>
          <button
            type="button"
            className="command-close"
            aria-label={t("close")}
            onClick={() => dialog.current?.close()}
          >
            <WorkspaceIcon path="m6 6 12 12M6 18 18 6" />
          </button>
        </header>
        <label className="sr-only" htmlFor={`${id}-search`}>
          {t("search")}
        </label>
        <input
          ref={input}
          id={`${id}-search`}
          className="command-search"
          type="search"
          maxLength={100}
          autoComplete="off"
          placeholder={t("search")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "Escape") {
              event.preventDefault();
              dialog.current?.close();
            }
            if (event.key === "ArrowDown" && matches.length > 0) {
              event.preventDefault();
              firstLink.current?.focus();
            }
            if (event.key === "Enter" && matches.length > 0) {
              event.preventDefault();
              firstLink.current?.click();
            }
          }}
        />
        {isOpen && (
          <>
            <p className={matches.length === 0 ? "command-empty" : "sr-only"} role="status">
              {matches.length === 0 ? t("empty") : t("matches", { count: matches.length })}
            </p>
            {matches.length > 0 && (
              <nav aria-label={t("trigger")} className="command-results">
                <ul>
                  {matches.map((item, index) => (
                    <li key={item.key}>
                      <Link
                        ref={index === 0 ? firstLink : undefined}
                        href={item.href}
                        className="command-result"
                        onClick={() => dialog.current?.close()}
                      >
                        <WorkspaceIcon path={item.path} />
                        <span>
                          <strong>{item.label}</strong>
                          <span>{t(`hints.${item.key}`)}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
          </>
        )}
        <p id={`${id}-hint`} className="command-hint">
          {t("hint")}
        </p>
      </dialog>
    </>
  );
}
