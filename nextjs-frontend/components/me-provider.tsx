"use client";

import { createContext, useContext } from "react";

import type { Me } from "@/lib/me";

const MeContext = createContext<Me | null>(null);

export function MeProvider({ me, children }: { me: Me; children: React.ReactNode }) {
  return <MeContext.Provider value={me}>{children}</MeContext.Provider>;
}

/** Signed-in user inside the app area. The API enforces permissions; this only hides UI. */
export function useMe(): Me | null {
  return useContext(MeContext);
}

export function useIsOwner(): boolean {
  return useContext(MeContext)?.role === "owner";
}
