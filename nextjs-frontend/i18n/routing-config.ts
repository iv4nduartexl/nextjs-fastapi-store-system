import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "es"],
  defaultLocale: "en",
  // Persist the chosen language across browser restarts (next-intl v4 uses a session cookie by default)
  localeCookie: {
    maxAge: 60 * 60 * 24 * 365,
  },
});
