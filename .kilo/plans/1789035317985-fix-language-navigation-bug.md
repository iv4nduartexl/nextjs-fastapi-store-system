# Plan: Fix Language Navigation Bug

## Context
The application uses `next-intl` for localization with a `[locale]` directory structure. Navigation between pages is losing the selected language because the application uses the standard `next/link` component with hardcoded `href` paths instead of the locale-aware `Link` component from `next-intl/navigation`.

## Decisions
- Replace `import Link from "next/link"` with `import { Link } from "@/i18n/routing"` or `import { Link } from "next-intl/link"` where appropriate.
- Ensure all navigation links correctly include the current locale as part of the path.

## Tasks
1. [ ] **Audit Link Usage**: Use `grep` to find all instances of `import Link from "next/link"`.
2. [ ] **Refactor Navigation**:
    - Update imports to use the locale-aware `Link` component.
    - If a component cannot use the `next-intl` `Link` (e.g., due to it being a server component or specific client requirement), manually prefix `href` with `{locale}`.
3. [ ] **Verification**:
    - Run `pnpm run build && pnpm run start` locally to verify that language is persisted during navigation.

## Risks
- Incorrectly updating links might break navigation if paths are not correctly resolved.
- Some complex `Link` usage might require manual adjustment if replacing with `next-intl`'s `Link` causes issues with other props or styling.

## Validation
- Navigate between multiple pages (e.g., Dashboard -> Products -> Customers) while the app is in Spanish (`/es`).
- Ensure the URL remains `/es/...` throughout navigation.
