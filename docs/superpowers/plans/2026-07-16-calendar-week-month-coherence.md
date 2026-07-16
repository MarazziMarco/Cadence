# Calendar Week and Desktop Month Coherence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a Google-Calendar-like phone week with continuous seven-to-three-day pinch, an optional phone timeline layout, desktop Month and Agenda views, and restored post-optimization messages.

**Architecture:** Add pure phone-week preference and geometry helpers, then build focused phone week renderers on the existing appointment/card and mutation contracts. Keep `CalendarController` as the single state/query/overlay owner, add a separate desktop month renderer backed by existing month helpers, and restore `MovedMessages` inside the contextual batch apply flow.

**Tech Stack:** Next.js 15 App Router, React 18, TypeScript, TanStack Query, Supabase, Tailwind CSS, Vitest/Testing Library, Playwright.

## Global Constraints

- Phone Week defaults to a seven-column vertical time grid.
- Header pinch changes continuously from seven to three visible days and is never persisted.
- Phone timeline layout is device-local and phone-only.
- Tablet and desktop Week always use a vertical time grid.
- Desktop exposes Day, Week, Month, and Agenda.
- Week optimization always targets Monday through Sunday regardless of layout or zoom.
- Contextual apply must offer messages for applied appointment moves only.
- No database migration or optimizer Edge Function contract change.
- Preserve authenticated atomic create, move, resize, apply, and undo paths.
- Preserve `.claude/settings.local.json` as an unstaged user change.

---

### Task 1: Phone Week Preference and Continuous Geometry

**Files:**
- Create: `lib/calendar/week-layout.ts`
- Create: `test/calendar/week-layout.test.ts`

**Interfaces:**
- Produces: `PhoneWeekLayout`, `PHONE_WEEK_LAYOUT_STORAGE_KEY`, `parsePhoneWeekLayout(value)`, `clampVisibleWeekDays(value)`, `weekColumnWidth(containerWidth, visibleDays)`, and `selectedDayScrollLeft(input)`.

- [ ] **Step 1: Write the failing helper tests**

```ts
import { describe, expect, it } from 'vitest'

import {
  PHONE_WEEK_LAYOUT_STORAGE_KEY,
  clampVisibleWeekDays,
  parsePhoneWeekLayout,
  selectedDayScrollLeft,
  weekColumnWidth,
} from '@/lib/calendar/week-layout'

describe('phone week layout', () => {
  it('defaults invalid device-local preferences to grid', () => {
    expect(PHONE_WEEK_LAYOUT_STORAGE_KEY)
      .toBe('cadence.calendar.phoneWeekLayout')
    expect(parsePhoneWeekLayout(null)).toBe('grid')
    expect(parsePhoneWeekLayout('unknown')).toBe('grid')
    expect(parsePhoneWeekLayout('timeline')).toBe('timeline')
  })

  it('keeps continuous week zoom between three and seven days', () => {
    expect(clampVisibleWeekDays(2.4)).toBe(3)
    expect(clampVisibleWeekDays(4.25)).toBe(4.25)
    expect(clampVisibleWeekDays(8)).toBe(7)
    expect(weekColumnWidth(350, 7)).toBe(50)
    expect(weekColumnWidth(350, 3.5)).toBe(100)
  })

  it('centers the selected day without scrolling outside the week', () => {
    expect(selectedDayScrollLeft({
      containerWidth: 350,
      columnWidth: 100,
      selectedIndex: 3,
      dayCount: 7,
    })).toBe(225)
    expect(selectedDayScrollLeft({
      containerWidth: 350,
      columnWidth: 100,
      selectedIndex: 0,
      dayCount: 7,
    })).toBe(0)
  })
})
```

- [ ] **Step 2: Run the helper test and verify RED**

Run:

```bash
npx vitest run test/calendar/week-layout.test.ts --pool=threads --maxWorkers=1 --no-file-parallelism
```

Expected: FAIL because `@/lib/calendar/week-layout` does not exist.

- [ ] **Step 3: Implement the pure helpers**

```ts
export type PhoneWeekLayout = 'grid' | 'timeline'

export const PHONE_WEEK_LAYOUT_STORAGE_KEY =
  'cadence.calendar.phoneWeekLayout'

export function parsePhoneWeekLayout(value: unknown): PhoneWeekLayout {
  return value === 'timeline' ? 'timeline' : 'grid'
}

export function clampVisibleWeekDays(value: number) {
  if (!Number.isFinite(value)) return 7
  return Math.min(7, Math.max(3, value))
}

export function weekColumnWidth(
  containerWidth: number,
  visibleDays: number,
) {
  return containerWidth / clampVisibleWeekDays(visibleDays)
}

export function selectedDayScrollLeft({
  containerWidth,
  columnWidth,
  selectedIndex,
  dayCount,
}: {
  containerWidth: number
  columnWidth: number
  selectedIndex: number
  dayCount: number
}) {
  const contentWidth = columnWidth * dayCount
  const centered = selectedIndex * columnWidth
    + columnWidth / 2
    - containerWidth / 2
  return Math.min(
    Math.max(0, contentWidth - containerWidth),
    Math.max(0, centered),
  )
}
```

- [ ] **Step 4: Run the helper test and verify GREEN**

Run the Step 2 command.

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/calendar/week-layout.ts test/calendar/week-layout.test.ts
git commit -m "feat: add phone week layout geometry"
```

---

### Task 2: Week Header Pinch Hook

**Files:**
- Create: `hooks/use-week-header-pinch.ts`
- Create: `test/calendar/week-header-pinch.test.tsx`

**Interfaces:**
- Consumes: `clampVisibleWeekDays` from Task 1.
- Produces: `weekPinchStep({ visibleDays, previousDistance, nextDistance })` and `useWeekHeaderPinch({ visibleDays, onVisibleDaysChange, onPinchEnd })`.

- [ ] **Step 1: Write failing pinch math and pointer tests**

```tsx
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  useWeekHeaderPinch,
  weekPinchStep,
} from '@/hooks/use-week-header-pinch'

describe('week header pinch', () => {
  it('zooms continuously and clamps at three and seven days', () => {
    expect(weekPinchStep({
      visibleDays: 7,
      previousDistance: 100,
      nextDistance: 140,
    })).toBe(5)
    expect(weekPinchStep({
      visibleDays: 3.2,
      previousDistance: 100,
      nextDistance: 200,
    })).toBe(3)
    expect(weekPinchStep({
      visibleDays: 6,
      previousDistance: 120,
      nextDistance: 60,
    })).toBe(7)
  })

  it('ignores mouse pointers and emits touch pinch changes', () => {
    const onVisibleDaysChange = vi.fn()
    const { result } = renderHook(() => useWeekHeaderPinch({
      visibleDays: 7,
      onVisibleDaysChange,
      onPinchEnd: vi.fn(),
    }))

    act(() => {
      result.current.handlers.onPointerDown(pointer(1, 100, 'touch'))
      result.current.handlers.onPointerDown(pointer(2, 200, 'touch'))
      result.current.handlers.onPointerMove(pointer(2, 240, 'touch'))
    })
    expect(onVisibleDaysChange).toHaveBeenCalledWith(5)
  })
})

function pointer(id: number, x: number, pointerType: string) {
  return {
    pointerId: id,
    pointerType,
    clientX: x,
    clientY: 20,
    preventDefault: vi.fn(),
    currentTarget: { setPointerCapture: vi.fn() },
  } as never
}
```

- [ ] **Step 2: Run the pinch test and verify RED**

Run:

```bash
npx vitest run test/calendar/week-header-pinch.test.tsx --pool=threads --maxWorkers=1 --no-file-parallelism
```

Expected: FAIL because the hook does not exist.

- [ ] **Step 3: Implement continuous horizontal pinch**

Implement the hook with a `Map<number, {x:number;y:number}>`, ignoring
`pointerType === 'mouse'`. Use this exact math:

```ts
export function weekPinchStep({
  visibleDays,
  previousDistance,
  nextDistance,
}: {
  visibleDays: number
  previousDistance: number
  nextDistance: number
}) {
  if (previousDistance <= 0 || nextDistance <= 0) return visibleDays
  return clampVisibleWeekDays(
    visibleDays * previousDistance / nextDistance,
  )
}
```

The hook must update its `visibleDaysRef` on every render and after each emitted
step, call `event.preventDefault()` only while two touch/pen pointers are
active, and call `onPinchEnd()` when pointer count drops below two.

- [ ] **Step 4: Run the pinch test and verify GREEN**

Run the Step 2 command.

Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add hooks/use-week-header-pinch.ts test/calendar/week-header-pinch.test.tsx
git commit -m "feat: add continuous week header pinch"
```

---

### Task 3: Default Phone Week Time Grid

**Files:**
- Create: `components/calendar/multi-day-time-grid.tsx`
- Create: `components/calendar/mobile-week-time-grid.tsx`
- Create: `test/calendar/mobile-week-time-grid.test.tsx`
- Modify: `components/calendar/appointment-card.tsx`
- Modify: `components/calendar/tablet-multi-day-calendar.tsx`

**Interfaces:**
- Consumes: `CalendarRendererProps`, `weekRange`, `weekColumnWidth`, `selectedDayScrollLeft`, `useWeekHeaderPinch`, `AppointmentCard`, and `CalendarToolbar`.
- Produces: `MultiDayTimeGrid` shared by phone/tablet and `MobileWeekTimeGrid(props)` with `visibleDays` internal state reset to `7` on mount and selected week change.

- [ ] **Step 1: Write failing component tests**

Test these observable behaviors:

```tsx
it('starts with seven aligned day columns and full-week optimization', () => {
  renderWeek()
  expect(screen.getByTestId('mobile-week-time-grid'))
    .toHaveAttribute('data-visible-days', '7')
  expect(screen.getAllByTestId('week-day-header')).toHaveLength(7)
  expect(screen.getAllByTestId('week-day-column')).toHaveLength(7)
})

it('updates header and body width continuously during pinch', () => {
  renderWeek()
  fireEvent.pointerDown(screen.getByTestId('week-pinch-header'), {
    pointerId: 1, pointerType: 'touch', clientX: 100,
  })
  fireEvent.pointerDown(screen.getByTestId('week-pinch-header'), {
    pointerId: 2, pointerType: 'touch', clientX: 200,
  })
  fireEvent.pointerMove(screen.getByTestId('week-pinch-header'), {
    pointerId: 2, pointerType: 'touch', clientX: 240,
  })
  expect(screen.getByTestId('mobile-week-time-grid'))
    .toHaveAttribute('data-visible-days', '5')
  expect(screen.getByTestId('week-day-header'))
    .toHaveStyle({ width: '20%' })
  expect(screen.getByTestId('week-day-column'))
    .toHaveStyle({ width: '20%' })
})

it('resets temporary zoom when the week changes', () => {
  const { rerender } = renderWeek({ selectedDate: '2026-07-16' })
  pinchToFiveDays()
  rerender(calendar({ selectedDate: '2026-07-23' }))
  expect(screen.getByTestId('mobile-week-time-grid'))
    .toHaveAttribute('data-visible-days', '7')
})
```

Mock element widths with `getBoundingClientRect()` returning `350px`.

- [ ] **Step 2: Run the mobile grid test and verify RED**

Run:

```bash
npx vitest run test/calendar/mobile-week-time-grid.test.tsx --pool=threads --maxWorkers=1 --no-file-parallelism
```

Expected: FAIL because `MobileWeekTimeGrid` does not exist.

- [ ] **Step 3: Implement the Google-Calendar-like grid**

Build seven dates from `weekRange(selectedDate).from`. Render:

```tsx
<section
  data-testid="mobile-week-time-grid"
  data-visible-days={visibleDays}
>
  <CalendarToolbar
    selectedDate={selectedDate}
    view="week"
    enabledViews={['day', 'week', 'month', 'agenda']}
    onToday={onToday}
    onViewChange={onViewChange}
    onOptimize={onOptimize}
    optimizeButtonRef={optimizeButtonRef}
  />
  <div ref={horizontalRef} className="overflow-x-auto">
    <div style={{ width: `${columnWidth * 7 + railWidth}px` }}>
      <div
        data-testid="week-pinch-header"
        className="grid touch-pan-x"
        style={{
          gridTemplateColumns: `${railWidth}px repeat(7, ${columnWidth}px)`,
        }}
        {...pinch.handlers}
      >
        <span aria-hidden="true" />
        {days.map((date) => (
          <button
            key={date}
            data-testid="week-day-header"
            style={{ width: columnWidth }}
            onClick={() => onSelectDate(date)}
          >
            {formatBusinessDate(date, dateLocale, {
              weekday: 'short',
              day: 'numeric',
            })}
          </button>
        ))}
      </div>
      <MultiDayTimeGrid
        days={days}
        columnWidth={columnWidth}
        railWidth={railWidth}
        appointments={appointments}
        config={config}
        density={density}
        onSelectAppointment={onSelectAppointment}
        onCreateAt={onCreateAt}
        onMove={onMove}
        onResize={onResize}
      />
    </div>
  </div>
</section>
```

Move the existing Tablet calculations into `MultiDayTimeGrid`:

- dynamic `rangeStart`/`rangeEnd`;
- `minutesToY`;
- hour grid lines;
- `allocateOverlapLanes`;
- `AppointmentCard`;
- blank-slot `onCreateAt`.

Give it this interface:

```ts
interface MultiDayTimeGridProps {
  days: string[]
  columnWidth?: number
  railWidth: number
  appointments: CalendarAppointment[]
  config: CalendarConfig
  density: number
  compactWeek?: boolean
  onSelectAppointment(id: string): void
  onCreateAt(date: string, startMinute: number): void
  onMove(request: MoveIntent): void
  onResize(request: ResizeIntent): void
}
```

When `columnWidth` is absent, use CSS fractional columns for Tablet. Refactor
`TabletMultiDayCalendar` to render its toolbar/header and delegate only the
time-grid body to this component; its current behavior and tests must remain
unchanged.

Set each header and body column to `columnWidth` pixels so alignment cannot
drift. During pinch, update width without changing queries or appointment
buckets. After width changes, call `selectedDayScrollLeft` with the current
container width, computed column width, selected-day index, and `dayCount: 7`,
inside `requestAnimationFrame`.

At seven visible days, add `compactWeek` to `AppointmentCard`; below five days,
remove it so service detail can appear.

- [ ] **Step 4: Add compact appointment-card presentation**

Add an optional prop:

```ts
compactWeek?: boolean
```

When true, render start time and client name only, while retaining the existing
accessible label, `data-appointment-id`, gesture surface, and 44px minimum
interactive height.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
npx vitest run test/calendar/mobile-week-time-grid.test.tsx test/calendar/mobile-day.test.tsx --pool=threads --maxWorkers=1 --no-file-parallelism
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add components/calendar/multi-day-time-grid.tsx components/calendar/mobile-week-time-grid.tsx components/calendar/tablet-multi-day-calendar.tsx components/calendar/appointment-card.tsx test/calendar/mobile-week-time-grid.test.tsx
git commit -m "feat: add pinchable phone week grid"
```

---

### Task 4: Optional Phone Daily Timeline Week

**Files:**
- Create: `components/calendar/mobile-week-timeline.tsx`
- Create: `test/calendar/mobile-week-timeline.test.tsx`

**Interfaces:**
- Consumes: `CalendarAppointment[]`, `CalendarConfig`, week date helpers, and controller callbacks.
- Produces: `MobileWeekTimeline` with appointment selection and empty-time transition to Day.

- [ ] **Step 1: Write failing timeline tests**

```tsx
it('positions appointments horizontally within working windows', () => {
  renderTimeline()
  expect(screen.getByTestId('timeline-appointment-a'))
    .toHaveStyle({ left: '0%', width: '25%' })
})

it('shows lunch closure separately from recoverable gaps', () => {
  renderTimeline()
  expect(screen.getByTestId('timeline-closure-780-840'))
    .toBeInTheDocument()
})

it('opens appointments and enters Day from empty time', async () => {
  const onSelectAppointment = vi.fn()
  const onSelectDate = vi.fn()
  const onViewChange = vi.fn()
  renderTimeline({ onSelectAppointment, onSelectDate, onViewChange })
  await userEvent.click(screen.getByTestId('timeline-appointment-a'))
  expect(onSelectAppointment).toHaveBeenCalledWith('a')
  fireEvent.click(screen.getByTestId('timeline-day-2026-07-16'), {
    clientX: 240,
  })
  expect(onSelectDate).toHaveBeenCalledWith('2026-07-16')
  expect(onViewChange).toHaveBeenCalledWith('day')
})
```

- [ ] **Step 2: Run the timeline test and verify RED**

Run:

```bash
npx vitest run test/calendar/mobile-week-timeline.test.tsx --pool=threads --maxWorkers=1 --no-file-parallelism
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement seven horizontal day rows**

For every date, derive working windows from `config.workingHours` and holidays.
Map the first open minute to `0%` and the last open minute to `100%`.

Render each appointment with:

```tsx
style={{
  left: `${(startMinute - rangeStart) / rangeDuration * 100}%`,
  width: `${appointment.duration_minutes / rangeDuration * 100}%`,
}}
```

Render lunch or split-window closures with their own test IDs. Stop propagation
on appointment click. Empty-row click selects the date and changes to `day`.
Do not implement timeline drag/resize.

- [ ] **Step 4: Run the timeline test and verify GREEN**

Run the Step 2 command.

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add components/calendar/mobile-week-timeline.tsx test/calendar/mobile-week-timeline.test.tsx
git commit -m "feat: add phone week timeline layout"
```

---

### Task 5: Preference UI and Calendar Controller Integration

**Files:**
- Modify: `components/settings/preferences-client.tsx`
- Modify: `components/calendar/calendar-controller.tsx`
- Modify: `lib/i18n/dictionaries.ts`
- Modify: `test/calendar/calendar-controller.test.tsx`
- Create: `test/calendar/preferences-week-layout.test.tsx`
- Delete: `components/calendar/mobile-week-overview.tsx`

**Interfaces:**
- Consumes: Task 1 preference API and Tasks 3–4 renderers.
- Produces: local settings selector and correct phone renderer selection.

- [ ] **Step 1: Write failing preference and controller tests**

Preference test:

```tsx
it('stores the phone week layout only on this device', async () => {
  render(<PreferencesClient />)
  await userEvent.selectOptions(
    screen.getByLabelText('Phone week layout'),
    'timeline',
  )
  expect(localStorage.getItem(PHONE_WEEK_LAYOUT_STORAGE_KEY))
    .toBe('timeline')
})
```

Controller tests:

```tsx
it('uses grid by default and timeline from local preference on phone', async () => {
  renderController()
  await openWeek()
  expect(screen.getByTestId('mobile-week-time-grid')).toBeInTheDocument()

  cleanup()
  localStorage.setItem(PHONE_WEEK_LAYOUT_STORAGE_KEY, 'timeline')
  renderController()
  await openWeek()
  expect(screen.getByTestId('mobile-week-timeline')).toBeInTheDocument()
})

it('always uses the vertical grid outside phone layout', async () => {
  localStorage.setItem(PHONE_WEEK_LAYOUT_STORAGE_KEY, 'timeline')
  installResponsiveLayout('three-day')
  renderController()
  expect(screen.getByTestId('tablet-3-day-calendar')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npx vitest run test/calendar/preferences-week-layout.test.tsx test/calendar/calendar-controller.test.tsx --pool=threads --maxWorkers=1 --no-file-parallelism
```

Expected: FAIL because the selector/renderers are not integrated.

- [ ] **Step 3: Add the device-local Preferences section**

Initialize state safely for hydration:

```ts
const [phoneWeekLayout, setPhoneWeekLayout] =
  useState<PhoneWeekLayout>('grid')

useEffect(() => {
  setPhoneWeekLayout(parsePhoneWeekLayout(
    localStorage.getItem(PHONE_WEEK_LAYOUT_STORAGE_KEY),
  ))
}, [])
```

Add a second Card titled with localized `prefs.calendarTitle`. Use a native
select labeled `prefs.phoneWeekLayout` with `grid` and `timeline`. Persist
immediately on selection; do not include it in the business Save button dirty
state.

- [ ] **Step 4: Integrate phone Week selection**

Restore the same local preference in `CalendarController`. For phone Week:

```tsx
phoneWeekLayout === 'timeline' ? (
  <MobileWeekTimeline
    appointments={appointments}
    config={config}
    selectedDate={state.selectedDate}
    onSelectDate={handleSelectDate}
    onSelectAppointment={handleSelectAppointment}
    onViewChange={handleViewChange}
    onOptimize={businessId ? handleOpenOptimizer : undefined}
    optimizeButtonRef={mobileOptimizeButtonRef}
  />
) : (
  <MobileWeekTimeGrid
    {...rendererProps}
    onDensityChange={handleDensityChange}
    onViewChange={handleViewChange}
    onOptimize={businessId ? handleOpenOptimizer : undefined}
    optimizeButtonRef={mobileOptimizeButtonRef}
  />
)
```

Keep `optimizationScope === 'week'` and `range === Monday–Sunday` unchanged.
Delete `MobileWeekOverview` and update test mocks.

- [ ] **Step 5: Add EN/IT/ES copy**

Add exact keys in each dictionary:

```text
prefs.calendarTitle
prefs.phoneWeekLayout
prefs.phoneWeekLayoutHint
prefs.phoneWeekGrid
prefs.phoneWeekTimeline
```

Italian wording must explain: “Questa scelta resta solo su questo telefono.”

- [ ] **Step 6: Run focused tests and verify GREEN**

Run the Step 2 command.

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add components/settings/preferences-client.tsx components/calendar/calendar-controller.tsx lib/i18n/dictionaries.ts test/calendar/calendar-controller.test.tsx test/calendar/preferences-week-layout.test.tsx components/calendar/mobile-week-overview.tsx
git commit -m "feat: add local phone week layout preference"
```

---

### Task 6: Desktop Month and Agenda

**Files:**
- Create: `components/calendar/desktop-month-calendar.tsx`
- Create: `test/calendar/desktop-month.test.tsx`
- Modify: `components/calendar/calendar-agenda.tsx`
- Modify: `components/calendar/calendar-controller.tsx`
- Modify: `lib/calendar/month.ts`
- Modify: `test/calendar/month.test.ts`
- Modify: `test/calendar/calendar-controller.test.tsx`

**Interfaces:**
- Produces: `DesktopMonthCalendar` and presentation-aware `CalendarAgenda`.

- [ ] **Step 1: Extend failing month helper tests**

Add `appointments: CalendarAppointment[]` to `MonthCell` while preserving
`visibleIndicators` for mobile:

```ts
expect(cells.find((cell) => cell.date === '2026-07-16')?.appointments)
  .toEqual([earlyAppointment, lateAppointment])
```

Verify a six-row month still returns 42 cells and a five-row month can be
identified by the last in-month cell.

- [ ] **Step 2: Write failing desktop month tests**

```tsx
it('renders appointments in full-width month cells', () => {
  renderMonth()
  expect(screen.getByTestId('desktop-month-calendar')).toBeInTheDocument()
  expect(screen.getByRole('button', {
    name: /09:00, Marco Rossi, Consultation/i,
  })).toBeInTheDocument()
})

it('opens an appointment and enters Day on a repeated selected-day click', async () => {
  const onSelectAppointment = vi.fn()
  const onViewChange = vi.fn()
  renderMonth({ onSelectAppointment, onViewChange })
  await userEvent.click(screen.getByRole('button', {
    name: /09:00, Marco Rossi/i,
  }))
  expect(onSelectAppointment).toHaveBeenCalledWith('appointment-1')
  await userEvent.click(screen.getByRole('gridcell', {
    name: /Thursday, July 16, 2026/i,
  }))
  expect(onViewChange).toHaveBeenCalledWith('day')
})
```

- [ ] **Step 3: Run month tests and verify RED**

Run:

```bash
npx vitest run test/calendar/month.test.ts test/calendar/desktop-month.test.tsx --pool=threads --maxWorkers=1 --no-file-parallelism
```

Expected: FAIL because full appointment buckets and desktop renderer do not
exist.

- [ ] **Step 4: Implement desktop month**

Use `buildMonthCells`. Render weekday headers and a `role="grid"` with 42
cells. Each appointment button includes:

```tsx
aria-label={[
  fmtTime(appointment.start_time),
  patientName,
  serviceName,
  translatedStatus,
].join(', ')}
```

Show time, client, and service until cell height is exhausted; summarize the
remaining count with `cal.moreAppointments`. Appointment click stops
propagation and calls `onSelectAppointment(id)`. Cell click selects a new date
or changes to Day when already selected.

- [ ] **Step 5: Add desktop Agenda presentation**

Add:

```ts
presentation?: 'phone' | 'desktop'
```

Use `desktop` to increase content width, keep filters in three columns, and
remove phone-specific height assumptions. Query keys, pagination, filters, and
appointment callback remain unchanged.

- [ ] **Step 6: Integrate all four desktop views**

Change the desktop selector from `['day', 'week']` to:

```ts
['day', 'week', 'month', 'agenda']
```

Render with explicit branches:

```tsx
if (rendererView === 'month') {
  return (
    <DesktopMonthCalendar
      appointments={appointments}
      config={config}
      selectedDate={state.selectedDate}
      onSelectDate={handleSelectDate}
      onSelectAppointment={handleSelectAppointment}
      onNavigateMonth={navigate}
      onViewChange={handleViewChange}
    />
  )
}
if (rendererView === 'agenda') {
  return (
    <CalendarAgenda
      presentation="desktop"
      businessId={businessId}
      config={config}
      selectedDate={state.selectedDate}
      onSelectDate={handleSelectDate}
      onSelectAppointment={handleSelectAgendaAppointment}
      onViewChange={handleViewChange}
    />
  )
}
return <DesktopWeekCalendar {...rendererProps} view={timelineView} />
```

Desktop Month uses month range and contextual month optimization. Desktop
Agenda keeps the current selected-date-forward agenda query.

- [ ] **Step 7: Run focused tests and verify GREEN**

Run:

```bash
npx vitest run test/calendar/month.test.ts test/calendar/desktop-month.test.tsx test/calendar/calendar-controller.test.tsx test/calendar/agenda.test.ts --pool=threads --maxWorkers=1 --no-file-parallelism
```

Expected: all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add components/calendar/desktop-month-calendar.tsx components/calendar/calendar-agenda.tsx components/calendar/calendar-controller.tsx lib/calendar/month.ts test/calendar/desktop-month.test.tsx test/calendar/month.test.ts test/calendar/calendar-controller.test.tsx
git commit -m "feat: add desktop month and agenda views"
```

---

### Task 7: Restore Messages After Contextual Apply

**Files:**
- Modify: `components/calendar/contextual-optimize-dialog.tsx`
- Create: `test/calendar/contextual-optimize-dialog.test.tsx`

**Interfaces:**
- Consumes: existing `MovedMessages`.
- Produces: post-apply state containing the exact successfully selected changes.

- [ ] **Step 1: Write the failing contextual-message test**

Mock two run groups: one moved appointment, one waiting-list insertion, and one
excluded move. Assert:

```tsx
await userEvent.click(screen.getByRole('checkbox', {
  name: /Excluded patient/i,
}))
await userEvent.click(screen.getByRole('button', {
  name: /Apply 2 changes/i,
}))

expect(applyOptimizationBatch).toHaveBeenCalledWith(
  'business-1',
  ['run-1', 'run-2'],
  ['move-1', 'waiting-1'],
)
expect(screen.getByTestId('moved-messages')).toHaveTextContent('move-1')
expect(screen.getByTestId('moved-messages')).not.toHaveTextContent('waiting-1')
expect(screen.getByTestId('moved-messages')).not.toHaveTextContent('move-2')
```

Mock `MovedMessages` to print received IDs, isolating the dialog selection
contract.

- [ ] **Step 2: Run the contextual dialog test and verify RED**

Run:

```bash
npx vitest run test/calendar/contextual-optimize-dialog.test.tsx --pool=threads --maxWorkers=1 --no-file-parallelism
```

Expected: FAIL because the applied state only renders a confirmation banner.

- [ ] **Step 3: Store and render applied changes**

Replace `const [applied, setApplied]` with:

```ts
const [appliedChanges, setAppliedChanges] =
  useState<any[] | null>(null)
```

Reset it in `optimize()`. After a successful apply:

```ts
setAppliedChanges(selected.map((change) => ({
  ...change,
  accepted: true,
})))
```

Add an early post-apply return before the existing preview return:

```tsx
if (appliedChanges) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle>{t('opt.title')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 overflow-y-auto p-5">
          <div className="rounded-xl border border-success/30 bg-success/10 p-4">
            {t('opt.applied', { n: appliedChanges.length })}
          </div>
          <MovedMessages
            businessId={businessId}
            changes={appliedChanges}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

`MovedMessages` already filters `accepted && appointment_id`, so waiting-list
insertions remain excluded while moves from every run are combined.

- [ ] **Step 4: Run message tests and verify GREEN**

Run:

```bash
npx vitest run test/calendar/contextual-optimize-dialog.test.tsx test/calendar/optimize-dialog.test.tsx --pool=threads --maxWorkers=1 --no-file-parallelism
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add components/calendar/contextual-optimize-dialog.tsx test/calendar/contextual-optimize-dialog.test.tsx
git commit -m "fix: restore messages after contextual optimization"
```

---

### Task 8: End-to-End Coverage and Final Verification

**Files:**
- Modify: `e2e/mobile-calendar.spec.ts`
- Create: `e2e/desktop-calendar.spec.ts`

**Interfaces:**
- Verifies all preceding deliverables without introducing production APIs.

- [ ] **Step 1: Extend mobile Playwright coverage**

Add tests that:

```ts
await view.selectOption('week')
await expect(page.getByTestId('mobile-week-time-grid'))
  .toHaveAttribute('data-visible-days', '7')
await page.evaluate(() => {
  localStorage.setItem(
    'cadence.calendar.phoneWeekLayout',
    'timeline',
  )
})
await page.reload()
await expect(page.getByTestId('mobile-week-timeline')).toBeVisible()
```

Use synthetic Pointer Events on `week-pinch-header` to assert an intermediate
visible-day value strictly between `3` and `7`, then switch to Day and back to
Week and assert reset to `7`.

- [ ] **Step 2: Add desktop Month and Agenda coverage**

In the desktop project:

```ts
await page.goto('/calendar')
await page.getByRole('button', { name: /Month|Mese|Mes/i }).click()
await expect(page.getByTestId('desktop-month-calendar')).toBeVisible()
await page.getByRole('button', { name: /Agenda/i }).click()
await expect(page.getByTestId('calendar-agenda')).toBeVisible()
```

Assert no document overflow and that an available month appointment opens the
quick sheet.

- [ ] **Step 3: List E2E tests**

Run:

```bash
npx playwright test --list e2e/mobile-calendar.spec.ts e2e/desktop-calendar.spec.ts
```

Expected: all new scenarios are discovered in the intended mobile/desktop
projects.

- [ ] **Step 4: Run complete Vitest suite**

Run:

```bash
npm test -- --pool=threads --maxWorkers=1 --no-file-parallelism --reporter=dot
```

Expected: all test files PASS.

- [ ] **Step 5: Run solver suite**

Run:

```bash
npm run test:solver
```

Expected: all Deno solver tests PASS.

- [ ] **Step 6: Run production build**

Run:

```bash
npm run build
```

Expected: Next.js production build completes successfully.

- [ ] **Step 7: Run targeted browser verification**

Run:

```bash
npm run test:e2e -- --project=mobile-safari e2e/mobile-calendar.spec.ts
npm run test:e2e -- --project=desktop-chrome e2e/desktop-calendar.spec.ts
```

Expected: mobile Week/Month/Day flows and desktop Month/Agenda flows PASS.

- [ ] **Step 8: Commit verification coverage**

```bash
git add e2e/mobile-calendar.spec.ts e2e/desktop-calendar.spec.ts
git commit -m "test: cover coherent calendar views"
```

- [ ] **Step 9: Inspect final repository state**

Run:

```bash
git status --short
git log --oneline -10
```

Expected: only `.claude/settings.local.json` remains unstaged; implementation
commits are present on `main`.
