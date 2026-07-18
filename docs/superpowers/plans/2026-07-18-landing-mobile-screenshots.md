# Landing Mobile Screenshots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the landing phone placeholders with the four approved real mobile screenshots.

**Architecture:** Keep the existing `PhoneShowcase` and `PhoneRow` components unchanged. Store the screenshots in `public/landing`, reference them with root-relative URLs, and extend the existing asset and landing integration checks.

**Tech Stack:** Next.js 15, React, Vitest, Testing Library, Playwright public-asset check.

## Global Constraints

- Keep the existing landing layout, animations, phone frames, localization, and responsive behavior unchanged.
- Store every screenshot in `public/landing` with a stable lowercase filename.
- Use the calendar in the hero and clients, voice, scheduler in the three-phone row.
- Keep voice in the middle so it is the phone visible on narrow screens.
- Do not include the optimization loading screenshot.

---

### Task 1: Add and wire the approved screenshots

**Files:**
- Create: `public/landing/mobile-calendar.png`
- Create: `public/landing/mobile-clients.png`
- Create: `public/landing/mobile-voice.png`
- Create: `public/landing/mobile-scheduler.png`
- Modify: `components/landing/landing.tsx:120-174`
- Modify: `test/landing/landing.test.tsx`
- Modify: `e2e/assets.spec.ts:3-17`

**Interfaces:**
- Consumes: `PhoneShowcase.screenshot?: string` and `PhoneRow.screenshots: (string | undefined)[]`.
- Produces: four public `/landing/mobile-*.png` URLs used by the landing.

- [ ] **Step 1: Write the failing landing integration test**

Add a test that renders `Landing`, collects image `src` values, and expects:

```ts
expect(screen.getAllByRole('img').map((image) => image.getAttribute('src'))).toEqual(
  expect.arrayContaining([
    '/landing/mobile-calendar.png',
    '/landing/mobile-clients.png',
    '/landing/mobile-voice.png',
    '/landing/mobile-scheduler.png',
  ]),
)
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
yarn test test/landing/landing.test.tsx --run --pool=threads --maxWorkers=1 --minWorkers=1
```

Expected: failure because the landing still renders phone placeholders.

- [ ] **Step 3: Copy and wire the screenshots**

Copy the uploaded files:

```text
IMG_6130.PNG -> public/landing/mobile-calendar.png
IMG_6131.PNG -> public/landing/mobile-clients.png
IMG_6133.PNG -> public/landing/mobile-voice.png
IMG_6132.PNG -> public/landing/mobile-scheduler.png
```

Pass the hero source:

```tsx
<PhoneShowcase
  screenshot="/landing/mobile-calendar.png"
  alt={copy.phone.alt}
  placeholder={copy.phone.placeholder}
  cards={phoneCards}
/>
```

Pass the row sources with voice in the center:

```tsx
<PhoneRow
  screenshots={[
    '/landing/mobile-clients.png',
    '/landing/mobile-voice.png',
    '/landing/mobile-scheduler.png',
  ]}
  alt={copy.phone.alt}
  placeholder={copy.phone.placeholder}
/>
```

Add all four URLs to `e2e/assets.spec.ts`.

- [ ] **Step 4: Run focused tests**

Run:

```bash
yarn test test/landing/landing.test.tsx --run --pool=threads --maxWorkers=1 --minWorkers=1
```

Expected: all landing integration tests pass.

- [ ] **Step 5: Verify production output**

Run `npm run build` without a concurrent `next dev` process in the same `.next` directory, then verify these files exist:

```text
.next/standalone/public/landing/mobile-calendar.png
.next/standalone/public/landing/mobile-clients.png
.next/standalone/public/landing/mobile-voice.png
.next/standalone/public/landing/mobile-scheduler.png
```

- [ ] **Step 6: Commit**

Stage only this plan, the four images, landing integration, and related tests:

```bash
git add docs/superpowers/plans/2026-07-18-landing-mobile-screenshots.md \
  public/landing/mobile-calendar.png public/landing/mobile-clients.png \
  public/landing/mobile-voice.png public/landing/mobile-scheduler.png \
  components/landing/landing.tsx test/landing/landing.test.tsx e2e/assets.spec.ts
git commit -m "feat: add real mobile screenshots to landing"
```
