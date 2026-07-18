# Mobile Calendar Navigation and Landing Story Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add contextual previous/next plus swipe navigation to mobile calendars and convert the complete public landing into one eight-step EN/IT/ES sticky story.

**Architecture:** Keep calendar date movement in `CalendarController.navigate()` and expose it through optional shared-toolbar callbacks. Keep public-page translations and story state inside focused landing modules, leaving authenticated i18n and unrelated business behavior unchanged.

**Tech Stack:** Next.js 15, React 18, TypeScript, Tailwind CSS, Framer Motion, Vitest, Testing Library, Playwright.

## Global Constraints

- Preserve all concurrent uncommitted Claude changes exactly.
- Do not modify solver, calendar API, optimizer, appointment mutation, map, or desktop calendar behavior.
- Day moves one day, week moves seven days, and month moves one calendar month.
- `Today` remains separate from the contextual range label.
- The landing has one walkthrough containing exactly eight chapters.
- English is the first-visit default; English, Italian, and Spanish switch the complete landing.
- Use real product screenshots and respect `prefers-reduced-motion`.
- Do not commit a file that already contained someone else's uncommitted edits; report those edits separately.

---

### Task 1: Shared mobile calendar navigation

**Files:**
- Modify: `components/calendar/calendar-toolbar.tsx`
- Modify: `components/calendar/calendar-controller.tsx`
- Modify: `components/calendar/mobile-day-calendar.tsx`
- Modify: `components/calendar/mobile-month-calendar.tsx`
- Modify: `components/calendar/mobile-week-time-grid.tsx`
- Modify: `components/calendar/mobile-week-timeline.tsx`
- Test: `test/calendar/calendar-toolbar-navigation.test.tsx`
- Test: `test/calendar/calendar-controller.test.tsx`

**Interfaces:**
- Consumes: existing `navigate(direction: -1 | 1): void` in `CalendarController`.
- Produces: optional toolbar props `onNavigate?(direction: -1 | 1): void` and localized contextual labels derived from `selectedDate` and `view`.

- [ ] **Step 1: Write failing toolbar interaction tests**

Render `CalendarToolbar` with `view="week"` and `onNavigate={spy}`. Assert
accessible previous/next buttons call `spy(-1)` and `spy(1)`. Fire touch start
and touch end on the range label with at least 60 horizontal pixels and assert
the same calls. Repeat label assertions for day, week, and month.

- [ ] **Step 2: Run failing tests**

Run:

```bash
npx vitest run test/calendar/calendar-toolbar-navigation.test.tsx
```

Expected: FAIL because `onNavigate` and header swipe controls do not exist.

- [ ] **Step 3: Implement toolbar controls**

Extend `CalendarToolbarProps`:

```ts
onNavigate?(direction: -1 | 1): void
```

Use `weekRange(selectedDate)` plus `formatBusinessDate` to produce a day, week,
or month label. Render 44-pixel previous and next buttons around the label while
keeping `Today` separate. Store touch start coordinates in a ref and call
`onNavigate` only when horizontal travel is at least 60 pixels and greater than
vertical travel.

- [ ] **Step 4: Wire navigation without duplicating business logic**

Add `onNavigate` to the four phone renderer prop types and pass it to
`CalendarToolbar`. In `CalendarController`, pass the existing `navigate`
callback. Keep month-grid `onNavigateMonth={navigate}` unchanged.

- [ ] **Step 5: Verify date increments and appointment creation**

Extend controller tests to select day, week, and month views, invoke toolbar
navigation, and assert selected dates advance by 1, 7, and one calendar month.
After day navigation, invoke new appointment and assert `createAt.date` equals
the navigated date.

- [ ] **Step 6: Run calendar regression tests**

Run:

```bash
npx vitest run test/calendar/calendar-toolbar-navigation.test.tsx test/calendar/calendar-controller.test.tsx test/calendar/mobile-day.test.tsx test/calendar/mobile-month.test.tsx
```

Expected: all tests PASS.

- [ ] **Step 7: Stage only clean calendar files**

Run `git status --short` before staging. If none of the task files were dirty
before this task, commit them with:

```bash
git add components/calendar/calendar-toolbar.tsx components/calendar/calendar-controller.tsx components/calendar/mobile-day-calendar.tsx components/calendar/mobile-month-calendar.tsx components/calendar/mobile-week-time-grid.tsx components/calendar/mobile-week-timeline.tsx test/calendar/calendar-toolbar-navigation.test.tsx test/calendar/calendar-controller.test.tsx
git commit -m "feat: add mobile calendar range navigation"
```

Otherwise leave the task uncommitted and preserve the pre-existing diff.

### Task 2: Landing copy and locale control

**Files:**
- Create: `components/landing/landing-copy.ts`
- Create: `components/landing/landing-language-switcher.tsx`
- Test: `test/landing/landing-copy.test.ts`
- Test: `test/landing/landing-language-switcher.test.tsx`

**Interfaces:**
- Produces: `LandingLocale = 'en' | 'it' | 'es'`.
- Produces: `LANDING_COPY: Record<LandingLocale, LandingCopy>`.
- Produces: `LandingLanguageSwitcher({ locale, onChange })`.

- [ ] **Step 1: Write failing locale tests**

Assert all three dictionaries expose the same keys, contain eight walkthrough
steps in the required order, and contain localized hero, CTA, feature, footer,
and compact disclaimer copy. Render the selector and assert its three buttons
change locale and expose the current choice with `aria-pressed`.

- [ ] **Step 2: Run failing tests**

Run:

```bash
npx vitest run test/landing/landing-copy.test.ts test/landing/landing-language-switcher.test.tsx
```

Expected: FAIL because landing locale modules do not exist.

- [ ] **Step 3: Implement typed copy**

Define a typed `LandingCopy` containing header, hero, value proposition,
walkthrough, mobile showcase, feature cards, footer, and disclaimer. Populate
complete English, Italian, and Spanish values. Walkthrough order must be:

```ts
['voice', 'gaps', 'suggestions', 'optimized', 'messages', 'route', 'waiting', 'personal']
```

Store only semantic image paths and localized alternative text in each step.

- [ ] **Step 4: Implement accessible language control**

Render `EN`, `IT`, and `ES` as native buttons with `aria-pressed`. Do not read
workspace context. Locale persistence remains the landing container's
responsibility.

- [ ] **Step 5: Run locale tests**

Run:

```bash
npx vitest run test/landing/landing-copy.test.ts test/landing/landing-language-switcher.test.tsx
```

Expected: all tests PASS.

### Task 3: Unified sticky product story

**Files:**
- Create: `components/landing/product-story.tsx`
- Test: `test/landing/product-story.test.tsx`
- Modify: `e2e/assets.spec.ts`
- Create: `public/landing/route.webp`
- Create: `public/landing/waiting-list.webp`
- Create: `public/landing/personal-algorithm.webp`

**Interfaces:**
- Consumes: `LandingCopy['steps']`.
- Produces: `ProductStory({ heading, intro, steps })`.

- [ ] **Step 1: Write failing story tests**

Render eight translated steps and assert their order, one numbered text chapter
per step, one active visual, meaningful image alternatives, and a non-animated
initial state when `matchMedia('(prefers-reduced-motion: reduce)')` matches.

- [ ] **Step 2: Run failing story tests**

Run:

```bash
npx vitest run test/landing/product-story.test.tsx
```

Expected: FAIL because `ProductStory` does not exist.

- [ ] **Step 3: Implement story component**

Use Framer Motion `AnimatePresence` for the active screenshot and
`onViewportEnter` on ordered chapters to update the active index. Desktop uses
two columns with the visual column `sticky top-24`; mobile keeps a compact
`sticky top-16` visual above the chapter list. Disable transitions when reduced
motion is requested. Preserve normal DOM order and render all chapter text.

- [ ] **Step 4: Capture and optimize real screenshots**

Run the application with demonstration data. Capture route, waiting-list, and
scheduler-preference views at a consistent desktop viewport. Crop only browser
chrome, preserve real product UI, and encode WebP files under 350 KB each.
Update `e2e/assets.spec.ts` to require all eight assets.

- [ ] **Step 5: Run story and asset tests**

Run:

```bash
npx vitest run test/landing/product-story.test.tsx
npx playwright test e2e/assets.spec.ts
```

Expected: all tests PASS and every image returns HTTP 200.

### Task 4: Integrate complete multilingual landing

**Files:**
- Modify: `components/landing/landing.tsx`
- Test: `test/landing/landing.test.tsx`

**Interfaces:**
- Consumes: `LANDING_COPY`, `LandingLanguageSwitcher`, and `ProductStory`.
- Persists: local-storage key `cadence-landing-locale`.

- [ ] **Step 1: Write failing integration tests**

Render `Landing` with empty storage and assert English hero plus eight English
chapters. Click `IT`, assert hero, CTA, walkthrough, features, footer, and
disclaimer become Italian and storage contains `it`. Remount and assert `it` is
restored. Put an invalid value in storage and assert English. Repeat selection
coverage for Spanish.

- [ ] **Step 2: Run failing integration test**

Run:

```bash
npx vitest run test/landing/landing.test.tsx
```

Expected: FAIL because the current landing is hardcoded English and has no
locale control.

- [ ] **Step 3: Re-read and preserve concurrent landing diff**

Record `git diff -- components/landing/landing.tsx`. Re-open the complete file
immediately before editing. Keep Claude's phone showcase and every unrelated
class or section unchanged.

- [ ] **Step 4: Integrate locale and story**

Initialize `locale` to English. In an effect, restore only `en`, `it`, or `es`
from `cadence-landing-locale`. Persist explicit selection. Replace hardcoded
copy with `LANDING_COPY[locale]`, mount the selector in the header, and replace
only the existing walkthrough mapping with `ProductStory`. Render the localized
compact landing disclaimer without modifying `components/legal/disclaimer.tsx`.

- [ ] **Step 5: Run landing tests**

Run:

```bash
npx vitest run test/landing/landing.test.tsx test/landing/landing-copy.test.ts test/landing/landing-language-switcher.test.tsx test/landing/product-story.test.tsx
```

Expected: all tests PASS.

- [ ] **Step 6: Preserve commit ownership**

Do not commit `components/landing/landing.tsx` while its pre-existing Claude
changes remain uncommitted. New clean landing modules, tests, and assets may be
committed separately only if their ownership is unambiguous.

### Task 5: Full verification

**Files:**
- Verify only; modify scoped files only if a failure exposes a defect.

- [ ] **Step 1: Run all focused tests**

```bash
npx vitest run test/calendar test/landing
```

Expected: all tests PASS.

- [ ] **Step 2: Run production build**

```bash
npm run build
```

Expected: Next.js production build exits 0.

- [ ] **Step 3: Browser-check calendar**

At a phone viewport, verify day, week, and month labels; both arrows; horizontal
header swipe; separate Today action; and new appointment date after navigating
three weeks forward. At desktop width, verify existing controls are unchanged.

- [ ] **Step 4: Browser-check landing**

At phone and desktop widths, verify one eight-step sticky story, all real images,
EN/IT/ES full-page switching and persistence, reduced motion, no overlap, and no
horizontal overflow.

- [ ] **Step 5: Audit final diff**

Run:

```bash
git status --short
git diff --check
git diff --name-only
```

Confirm solver and pre-existing Claude-owned changes are byte-for-byte
unmodified by this implementation. Report every changed file and verification
result.
