# Mobile Week Readability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the phone week grid readable, vertically zoomable, and draggable across both time and days.

**Architecture:** Keep the existing controller and validated mutation path. Add a compact weekly card, give the week one two-axis viewport, reuse the Day vertical pinch hook, and add a week-specific gesture adapter that maps horizontal position to a target date.

**Tech Stack:** Next.js 15, React 18, TypeScript, Pointer Events, Vitest, Testing Library, Playwright.

## Global Constraints

- Change only the phone `grid` week; do not redesign the optional timeline week.
- Header pinch controls three-to-seven visible days and is never persisted.
- Body pinch controls the existing persisted hour density.
- Start time and client name must remain visually readable at seven days.
- All moves must use the existing versioned calendar mutation path.
- Inline resize is hidden at seven-day density; quick-sheet resize remains available.
- Preserve `.claude/settings.local.json`.

---

### Task 1: Separate temporal overlap from minimum visual height

**Files:**
- Modify: `lib/calendar/overlap-lanes.ts`
- Modify: `components/calendar/mobile-week-time-grid.tsx`
- Test: `test/calendar/overlap-lanes.test.ts`

**Interfaces:**
- Produces: `allocateTemporalOverlapLanes<T extends TimedLayout>(items: T[]): LaneLayout<T>[]`
- Preserves: current `allocateOverlapLanes()` callers outside phone Week.

- [ ] **Step 1: Write the failing regression test**

```ts
it('does not create an overlap lane from visual minimum height alone', () => {
  const layouts = allocateTemporalOverlapLanes([
    { id: 'a', top: 0, height: 30, temporalEnd: 30 },
    { id: 'b', top: 30, height: 30, temporalEnd: 60 },
  ])
  expect(layouts.map((item) => item.laneCount)).toEqual([1, 1])
})
```

- [ ] **Step 2: Verify failure**

Run: `npx vitest run test/calendar/overlap-lanes.test.ts`

Expected: FAIL because the current weekly input uses the forced 44-pixel height as temporal occupancy.

- [ ] **Step 3: Implement the temporal interface**

Add an optional `temporalEnd` to the lane input and use it for collision tests
while retaining `height` for rendering. In Week, pass the real
`minutesToY(duration, 0, density)` as `temporalEnd` and apply `Math.max(44, …)`
only to the rendered card height.

- [ ] **Step 4: Verify**

Run: `npx vitest run test/calendar/overlap-lanes.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/calendar/overlap-lanes.ts components/calendar/mobile-week-time-grid.tsx test/calendar/overlap-lanes.test.ts
git commit -m "fix: separate week overlap from visual height"
```

### Task 2: Add the compact weekly appointment presentation

**Files:**
- Create: `components/calendar/mobile-week-appointment-card.tsx`
- Modify: `components/calendar/mobile-week-time-grid.tsx`
- Test: `test/calendar/mobile-week-time-grid.test.tsx`

**Interfaces:**
- Consumes: `CalendarAppointment`, `MoveIntent`, week geometry.
- Produces:

```ts
interface MobileWeekAppointmentCardProps {
  appointment: CalendarAppointment
  top: number
  height: number
  leftPercent: number
  widthPercent: number
  showService: boolean
  onSelect(id: string): void
  gesture: WeekAppointmentGestureBindings
}
```

- [ ] **Step 1: Write failing component tests**

Test at a mocked seven-day width that the rendered card exposes visible text
for `09:00` and `Marco Rossi`, omits status/service, and has no resize button.
Test again at three-day width and expect the service name.

- [ ] **Step 2: Verify failure**

Run: `npx vitest run test/calendar/mobile-week-time-grid.test.tsx`

Expected: FAIL because the component and compact hierarchy do not exist.

- [ ] **Step 3: Implement the compact card**

Use a single full-surface button with `px-1 py-0.5`, a visible time line and a
visible client line. Keep the full service/duration/status string in
`aria-label`. Compute `showService` from column width and rendered height.

- [ ] **Step 4: Replace the shared full card in Week**

Render `MobileWeekAppointmentCard` only from `MobileWeekTimeGrid`. Leave Day,
tablet, and desktop on `AppointmentCard`.

- [ ] **Step 5: Verify**

Run: `npx vitest run test/calendar/mobile-week-time-grid.test.tsx test/calendar/quick-sheet.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/calendar/mobile-week-appointment-card.tsx components/calendar/mobile-week-time-grid.tsx test/calendar/mobile-week-time-grid.test.tsx
git commit -m "feat: add readable mobile week cards"
```

### Task 3: Give Week the Day vertical pinch and scroll behavior

**Files:**
- Modify: `components/calendar/mobile-week-time-grid.tsx`
- Modify: `hooks/use-pinch-zoom.ts`
- Test: `test/calendar/mobile-week-time-grid.test.tsx`
- Test: `test/calendar/gesture.test.ts`

**Interfaces:**
- Reuses: `usePinchZoom({ density, disabled, scrollRef, onDensityChange })`.
- Produces one `weekViewportRef` used for `scrollTop`, `scrollLeft`, pinch focal
  anchoring, and gesture auto-scroll.

- [ ] **Step 1: Write failing tests**

Simulate a two-pointer pinch in the body and assert `onDensityChange` changes
while `data-visible-days` remains unchanged. Simulate the same gesture in the
header and assert visible days change while density does not.

- [ ] **Step 2: Verify failure**

Run: `npx vitest run test/calendar/mobile-week-time-grid.test.tsx`

Expected: FAIL because Week mounts only `useWeekHeaderPinch`.

- [ ] **Step 3: Refactor to one two-axis viewport**

Make the body wrapper `relative overflow-auto overscroll-contain`, attach
`usePinchZoom` handlers to the body, keep header handlers on the header, and
add the same `calendarGestureActive` interlock used by Day.

- [ ] **Step 4: Anchor initial vertical scroll**

On week/date change, scroll near the current business-local time when today is
visible, otherwise near the earliest weekly appointment, otherwise the first
working hour.

- [ ] **Step 5: Verify**

Run: `npx vitest run test/calendar/mobile-week-time-grid.test.tsx test/calendar/gesture.test.ts test/calendar/mobile-day.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/calendar/mobile-week-time-grid.tsx hooks/use-pinch-zoom.ts test/calendar/mobile-week-time-grid.test.tsx test/calendar/gesture.test.ts
git commit -m "feat: add vertical zoom to mobile week"
```

### Task 4: Implement cross-day weekly dragging

**Files:**
- Create: `hooks/use-week-appointment-gesture.ts`
- Modify: `components/calendar/mobile-week-time-grid.tsx`
- Modify: `components/calendar/mobile-week-appointment-card.tsx`
- Test: `test/calendar/week-appointment-gesture.test.ts`
- Test: `test/calendar/mobile-week-time-grid.test.tsx`

**Interfaces:**
- Produces:

```ts
interface WeekDragGeometry {
  dates: string[]
  railWidth: number
  columnWidth: number
  contentLeft: number
}

interface WeekDragPreview {
  date: string
  startMinute: number
}
```

- [ ] **Step 1: Write pure failing geometry tests**

Assert that X inside column zero selects Monday, X across one boundary selects
Tuesday, values clamp to Monday/Sunday, and Y movement snaps using the existing
slot interval.

- [ ] **Step 2: Verify failure**

Run: `npx vitest run test/calendar/week-appointment-gesture.test.ts`

Expected: FAIL because the hook does not exist.

- [ ] **Step 3: Implement the gesture adapter**

Reuse the long-press threshold and click suppression semantics from
`useCalendarGesture`, but emit both preview date and preview start. On release,
call:

```ts
onMove({
  appointmentId,
  expectedVersion,
  date: preview.date,
  startMinute: preview.startMinute,
})
```

- [ ] **Step 4: Add two-axis edge auto-scroll**

Within the viewport bounds, scroll vertically near top/bottom and horizontally
near left/right. Recompute the target day after scrolling.

- [ ] **Step 5: Verify integration**

Test long-press movement within Monday and across the Tuesday boundary. Assert
the final `MoveIntent` contains the expected date and snapped minute.

Run: `npx vitest run test/calendar/week-appointment-gesture.test.ts test/calendar/mobile-week-time-grid.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add hooks/use-week-appointment-gesture.ts components/calendar/mobile-week-time-grid.tsx components/calendar/mobile-week-appointment-card.tsx test/calendar/week-appointment-gesture.test.ts test/calendar/mobile-week-time-grid.test.tsx
git commit -m "feat: drag mobile week appointments across days"
```

### Task 5: Add readable collision clusters

**Files:**
- Create: `lib/calendar/compact-clusters.ts`
- Create: `components/calendar/mobile-week-cluster-popover.tsx`
- Modify: `components/calendar/mobile-week-time-grid.tsx`
- Test: `test/calendar/compact-clusters.test.ts`
- Test: `test/calendar/mobile-week-time-grid.test.tsx`

**Interfaces:**
- Produces:

```ts
function compactClusters(
  layouts: LaneLayout<CalendarAppointment>[],
  availableWidth: number,
  minimumReadableWidth: number,
): Array<
  | { kind: 'appointment'; layout: LaneLayout<CalendarAppointment> }
  | { kind: 'cluster'; layouts: LaneLayout<CalendarAppointment>[] }
>
```

- [ ] **Step 1: Write failing pure tests**

Test that one/two readable lanes remain separate, three lanes under the width
threshold become one cluster, and wider three-day columns expand back to lanes.

- [ ] **Step 2: Verify failure**

Run: `npx vitest run test/calendar/compact-clusters.test.ts`

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement helper and popover**

Render the first compact card plus a `+N` button. The popover lists time and
client for every hidden appointment and opens the existing quick sheet through
`onSelectAppointment`.

- [ ] **Step 4: Verify**

Run: `npx vitest run test/calendar/compact-clusters.test.ts test/calendar/mobile-week-time-grid.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/calendar/compact-clusters.ts components/calendar/mobile-week-cluster-popover.tsx components/calendar/mobile-week-time-grid.tsx test/calendar/compact-clusters.test.ts test/calendar/mobile-week-time-grid.test.tsx
git commit -m "feat: cluster narrow mobile week collisions"
```

### Task 6: Mobile-week verification

**Files:**
- Modify: `e2e/mobile-calendar.spec.ts`

- [ ] **Step 1: Extend the E2E story**

At iPhone width, enter Week, assert a visible appointment contains a time and
client label, change vertical zoom, and drag a movable appointment into the
next day when fixture data permits.

- [ ] **Step 2: Run focused and full verification**

Run:

```bash
npx vitest run test/calendar/mobile-week-time-grid.test.tsx test/calendar/week-appointment-gesture.test.ts test/calendar/compact-clusters.test.ts
npm test -- --run --pool=threads --maxWorkers=1 --no-file-parallelism
npm run build
```

Expected: all Vitest files pass and production build exits 0.

- [ ] **Step 3: Run mobile E2E when WebKit is installed**

Run: `npm run test:e2e -- --project=mobile-safari e2e/mobile-calendar.spec.ts`

Expected: PASS. If WebKit is absent, record the environmental blocker without
claiming E2E success.

- [ ] **Step 4: Commit**

```bash
git add e2e/mobile-calendar.spec.ts
git commit -m "test: cover readable draggable mobile week"
```

