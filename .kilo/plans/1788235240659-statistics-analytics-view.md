# Statistics & Analytics View Fixes Plan

## Overview
The Statistics & Analytics view is currently broken due to missing translations and incorrect usage of translation hooks.

## Tasks

### 1. Update Translations (en.json & es.json)
- Add `statistics` object with keys for:
    - `title`
    - `tabs.charts`
    - `tabs.business`
    - `business.topProducts`
    - Any other hardcoded strings in `statistics/page.tsx`.
- Update `dashboard` object to include:
    - `statistics`
    - `statisticsDesc`

### 2. Update Statistics Page (`statistics/page.tsx`)
- Ensure all text is wrapped in translation hooks: `useTranslations("statistics")`.
- Verify all `Card` components are correctly imported.

## Validation
- [ ] No `MISSING_MESSAGE` errors in logs.
- [ ] All text content is translated according to the current locale.
- [ ] Statistics page loads correctly without crashing.

---
## Open Questions / Decisions Needed
- None, implementation is straightforward.
