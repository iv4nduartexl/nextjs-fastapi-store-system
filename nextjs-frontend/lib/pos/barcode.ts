// Barcode scanners type the code very fast and finish with Enter. This tells them apart from a person.

export interface ScannerDetector {
  /** Feed every key press; returns the scanned code when a scan just finished, otherwise null. */
  feed(key: string, timestamp: number): string | null;
  reset(): void;
}

export function createScannerDetector({
  maxGapMs = 50,
  minLength = 4,
}: { maxGapMs?: number; minLength?: number } = {}): ScannerDetector {
  let buffer = "";
  let last = 0;

  return {
    feed(key, timestamp) {
      if (timestamp - last > maxGapMs) buffer = "";
      last = timestamp;

      if (key === "Enter") {
        const code = buffer;
        buffer = "";
        return code.length >= minLength ? code : null;
      }
      if (key.length === 1) buffer += key;
      return null;
    },
    reset() {
      buffer = "";
      last = 0;
    },
  };
}
