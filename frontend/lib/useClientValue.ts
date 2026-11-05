"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/** Read a browser-only value (localStorage etc.) without a hydration mismatch. */
export function useClientValue<T, S>(get: () => T, server: S): T | S {
  return useSyncExternalStore<T | S>(noop, get, () => server);
}
