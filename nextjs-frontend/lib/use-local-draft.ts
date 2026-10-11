"use client";

import { useEffect, useRef } from "react";

/** Saves `value` to localStorage (debounced) so long forms survive a reload. */
export function useAutosave<T>(key: string, value: T, enabled = true, delayMs = 400) {
  const first = useRef(true);
  useEffect(() => {
    if (!enabled) return;
    // Don't overwrite a stored draft with the initial empty state before it's been offered back
    if (first.current) {
      first.current = false;
      return;
    }
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        /* storage full or disabled: autosave is best-effort */
      }
    }, delayMs);
    return () => clearTimeout(timer);
  }, [key, value, enabled, delayMs]);
}

export function readDraft<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function clearDraft(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
