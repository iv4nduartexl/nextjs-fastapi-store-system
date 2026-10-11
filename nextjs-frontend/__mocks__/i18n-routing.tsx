// Jest stand-in for @/i18n/routing: next-intl's navigation entry is ESM-only and
// can't be loaded by Jest, so expose plain equivalents of the same API.
import React from "react";

export const routing = { locales: ["en", "es"], defaultLocale: "en" };

export const Link = ({
  href,
  children,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
  <a href={href} {...props}>
    {children}
  </a>
);

export const redirect = jest.fn();
export const getPathname = jest.fn(({ href }: { href: string }) => href);
export const usePathname = jest.fn(() => "/");
export const useRouter = jest.fn(() => ({
  push: jest.fn(),
  replace: jest.fn(),
  refresh: jest.fn(),
  back: jest.fn(),
  prefetch: jest.fn(),
}));
