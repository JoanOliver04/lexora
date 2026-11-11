"use client";

import { useEffect, useRef } from "react";

/** Focus-scoped enhancements; native form controls retain their keyboard behaviour. */
export function useStudyShortcuts() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const card = ref.current;
    if (!card) return;
    const handleKey = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.isComposing ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      )
        return;
      const target = event.target;
      if (
        !(target instanceof HTMLElement) ||
        target.closest(
          'a, button, input, textarea, select, summary, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="button"], [role="checkbox"], [role="combobox"], [role="slider"], [role="spinbutton"]',
        )
      )
        return;
      const key = event.key === " " ? "Space" : event.key;
      if (!["Space", "1", "2", "3", "4"].includes(key)) return;
      const button = card.querySelector<HTMLButtonElement>(`button[data-study-shortcut="${key}"]`);
      if (!button || button.matches(":disabled")) return;
      event.preventDefault();
      button.click();
    };
    card.addEventListener("keydown", handleKey);
    return () => card.removeEventListener("keydown", handleKey);
  }, []);
  return ref;
}
