"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { fetchPosCatalog } from "@/components/actions/pos-action";
import type { PosProduct } from "@/lib/pos/catalog-search";

// Keep prices and stock reasonably fresh without slowing the register down
const REFRESH_MS = 3 * 60 * 1000;

/** The business catalog, loaded once and refreshed in the background. */
export function useCatalog() {
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    const result = await fetchPosCatalog();
    inFlight.current = false;
    setLoading(false);
    if (result.data) {
      setProducts(result.data);
      setError(false);
    } else {
      setError(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  /** Show a product created here right away, without waiting for the next refresh. */
  const addLocal = useCallback((product: PosProduct) => {
    setProducts((prev) => [...prev.filter((p) => p.id !== product.id), product]);
  }, []);

  return { products, loading, error, refresh, addLocal };
}
