# Mobile Calendar Navigation and Landing Story Design

**Date:** 2026-07-18

## Goal

Make future calendar dates reachable on mobile and turn the landing page's
existing product walkthrough into one coherent, multilingual scroll story.
Preserve current behavior, styling, and concurrent work outside this scope.

## Scope

### Mobile calendar navigation

Add visible previous and next controls to mobile calendar views and support the
same navigation with a horizontal swipe on the calendar header.

- Day view moves one calendar day.
- Week view moves one full week.
- Month view moves one calendar month.
- The center label describes the active range:
  - full selected date for day;
  - start and end dates for week;
  - month and year for month.
- `Today` remains a separate action and is never used as the range label.
- Creating an appointment after navigation uses the newly selected date.
- Existing desktop controls and keyboard shortcuts remain unchanged.
- Existing month-grid swipe remains available.
- Header swipe must not start on appointment cards or scrolling calendar
  content, avoiding conflicts with selection, vertical scrolling, and pinch
  zoom.

The existing `CalendarController.navigate()` logic remains the source of truth.
Mobile renderers receive navigation callbacks and expose them through their
shared toolbar. No appointment, optimizer, map, query, or mutation behavior
changes.

### Landing walkthrough

Replace the current sequence of independently stacked walkthrough rows with one
sticky scroll story. This is a transformation of the existing walkthrough, not
a new landing section.

The story contains exactly eight chapters in this order:

1. Book by voice
2. A week full of gaps
3. Smart suggestions, your call
4. A tight, optimized week
5. Messages ready to send
6. Best route with kilometres and time saved
7. Waiting list
8. An algorithm adapted to the user's preferences

Every chapter has the same visual hierarchy: number, title, description, and a
real product screenshot. The first five current screenshots stay in use. Three
new screenshots show the current route, waiting-list, and scheduling-preference
interfaces using demonstration data.

On desktop, chapter text scrolls in one column while the active screenshot stays
sticky in the other. Entering a chapter updates the screenshot with a short
crossfade and restrained slide. On mobile, the screenshot remains compact and
sticky while the chapter text advances below it. All content stays reachable
without animation or JavaScript-driven timing.

When `prefers-reduced-motion: reduce` is active, transitions become immediate
and no parallax or scroll-linked movement is used.

## Landing languages

The complete public landing page supports English, Italian, and Spanish.

- English is the default on first visit.
- A visible `EN / IT / ES` control appears in the header.
- The selection is stored locally and restored on later visits.
- Hero, calls to action, walkthrough, feature cards, footer, and compact legal
  disclaimer switch together, so the page never mixes interface languages.
- This public-page locale is independent of authenticated workspace language.
- Landing copy lives in a landing-specific typed dictionary. Shared application
  dictionaries and the shared legal disclaimer remain unchanged.

If stored locale data is missing or invalid, the landing safely uses English.

## Isolation

Concurrent uncommitted work already exists in the landing and solver. Preserve
it exactly.

- Add focused landing components and copy modules rather than expanding unrelated
  files.
- Limit edits in the active landing component to the integration required for
  locale selection and the unified walkthrough.
- Do not edit solver files, calendar APIs, route optimization, appointment
  mutations, or desktop calendar behavior.
- Commit only files belonging to this feature.

## Accessibility

- Previous and next controls are native buttons with localized accessible names.
- Touch targets are at least 44 by 44 CSS pixels.
- The active range is exposed as readable text.
- Swipe is an enhancement; every action remains possible through buttons.
- Language controls expose current selection.
- Story screenshots have localized meaningful alternative text.
- Story order remains logical in the DOM.
- Reduced-motion preferences are respected.

## Testing

Focused component tests cover:

- previous and next buttons in day, week, and month views;
- one-day, one-week, and one-month navigation increments;
- equivalent header swipe behavior;
- separate `Today` behavior;
- appointment creation using a navigated date;
- English default and invalid-storage fallback;
- Italian and Spanish selection and persistence;
- all eight chapters in the required order;
- reduced-motion-safe story rendering.

Existing calendar and landing asset tests are updated only where required. Run
focused Vitest tests, TypeScript/build validation, and browser checks at phone
and desktop widths. Browser verification confirms that sticky behavior,
translations, screenshots, controls, and existing landing sections render
without overlap or horizontal overflow.

## Acceptance criteria

1. A phone user can reach and create appointments on dates arbitrarily beyond
   the currently visible days.
2. Navigation increments always match the active day, week, or month view.
3. Desktop calendar behavior is unchanged.
4. The landing presents one eight-chapter story, not an additional feature
   section.
5. All chapters share one style and use real product imagery.
6. The entire landing switches coherently among English, Italian, and Spanish,
   with English as default.
7. Existing concurrent changes remain intact and unrelated functions do not
   change.
