"use client";

import { useEffect, useRef } from "react";

import { createScannerDetector } from "@/lib/pos/barcode";

function isTypingField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * Calls `onScan` when a barcode scanner types a code while focus is NOT in a text field
 * (scans into the search field are handled by the field's own Enter logic).
 */
export function useBarcodeScanner(onScan: (code: string) => void, enabled = true) {
  const handler = useRef(onScan);
  handler.current = onScan;

  useEffect(() => {
    if (!enabled) return;
    const detector = createScannerDetector();
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingField(e.target)) {
        detector.reset();
        return;
      }
      const code = detector.feed(e.key, e.timeStamp || performance.now());
      if (code) {
        e.preventDefault();
        handler.current(code);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}

export { isTypingField };
