"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

// Controlled fields can lose values entered before their event handlers exist.
export function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
