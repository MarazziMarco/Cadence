# Mobile Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Google-Calendar-inspired mobile calendar for Cadence with Day, Week, Month, and Agenda views, safe drag/resize, vertical zoom, business-timezone behavior, and contextual atomic optimization.

**Architecture:** Introduce a shared calendar controller and focused renderers while preserving the current desktop grid. Route all schedule mutations and optimization application through authenticated, version-checked PostgreSQL RPCs; React Query owns range data, optimistic updates, and rollback.

**Tech Stack:** Next.js 15 App Router, React 18, TypeScript 5.7, TanStack Query 5, Supabase/PostgreSQL RPC, Supabase Edge Functions/Deno, Tailwind CSS, shadcn/Radix/Vaul, Vitest, Testing Library, Playwright.

## Global Constraints

- Keep existing image paths and every directory under `public/` and `.emergent/` unchanged.
- New landing screenshots may later be added under `public/landing/`; do not capture or add them until calendar implementation is complete.
- Phone portrait supports Day, Week, Month, and Agenda; Day is default.
- Phone landscape and tablet portrait show three detailed days; tablet landscape and desktop show seven.
- Default calendar density is exactly 60 px/hour; allowed range is 36–120 px/hour.
- Duration resize is free for the appointment and never changes the service default.
- Month optimization preserves Monday–Sunday week membership by default.
- Cross-week month moves require explicit `ALLOW_CROSS_WEEK=true`; default displacement is seven days and allowed configuration range is 1–31.
- Hard constraints block; patient preferences and the business daily target warn and require explicit confirmation.
- All writes are authenticated, tenant-scoped, version-checked, idempotent, audited, and transactional.
- Business timezone is the only schedule timezone.
- Do not change global `components/ui/dialog.jsx`.
- Solver edits require `deno test --allow-read` and deployment of `optimize-schedule` after local verification.
- Preserve unrelated user changes, especially `.claude/settings.local.json`.

---

## File Structure

### New calendar domain files

- `lib/calendar/types.ts` — public calendar types and mutation contracts.
- `lib/calendar/date.ts` — business-timezone date/range helpers.
- `lib/calendar/geometry.ts` — time-grid geometry, snap, zoom, and pointer conversion.
- `lib/calendar/constraints.ts` — client-side display mapping for server constraint results.
- `lib/calendar/query-keys.ts` — canonical React Query keys.
- `lib/calendar/controller.ts` — reducer and pure controller state transitions.
- `lib/calendar/month.ts` — month cells, mini-agenda, and week-bucket helpers.
- `lib/calendar/agenda.ts` — agenda pagination and grouping helpers.

### New API/server files

- `lib/api/calendar.ts` — calendar config/range reads and RPC-backed mutations.
- `app/api/calendar/mutate/route.ts` — authenticated mutation endpoint.
- `app/api/calendar/optimize/route.ts` — authenticated contextual optimization orchestration.
- `app/api/calendar/optimize/apply/route.ts` — atomic optimization application.
- `supabase/migrations/202607160001_calendar_mutations.sql` — mutation RPCs, idempotency, audit, nullable optimizer creates.
- `supabase/migrations/202607160002_optimization_snapshots.sql` — run snapshots, batch grouping, atomic batch apply.

### New calendar UI files

- `components/calendar/calendar-controller.tsx`
- `components/calendar/desktop-week-calendar.tsx`
- `components/calendar/calendar-toolbar.tsx`
- `components/calendar/mobile-date-strip.tsx`
- `components/calendar/mobile-day-calendar.tsx`
- `components/calendar/mobile-week-overview.tsx`
- `components/calendar/mobile-month-calendar.tsx`
- `components/calendar/calendar-agenda.tsx`
- `components/calendar/tablet-multi-day-calendar.tsx`
- `components/calendar/appointment-card.tsx`
- `components/calendar/appointment-quick-sheet.tsx`
- `components/calendar/appointment-form.tsx`
- `components/calendar/move-appointment-sheet.tsx`
- `components/calendar/calendar-zoom-controls.tsx`
- `components/calendar/contextual-optimize-dialog.tsx`

### Test files

- `vitest.config.ts`
- `test/setup.ts`
- `test/harness.test.tsx`
- `test/calendar/date.test.ts`
- `test/calendar/geometry.test.ts`
- `test/calendar/controller.test.ts`
- `test/calendar/month.test.ts`
- `test/calendar/agenda.test.ts`
- `test/calendar/mutations.test.ts`
- `test/calendar/mobile-day.test.tsx`
- `test/calendar/mobile-month.test.tsx`
- `test/calendar/quick-sheet.test.tsx`
- `test/calendar/gesture.test.ts`
- `test/calendar/contextual-optimize.test.ts`
- `e2e/mobile-calendar.spec.ts`
- `e2e/assets.spec.ts`
- `playwright.config.ts`
- `supabase/functions/optimize-schedule/fixtures/i_month_week_isolation.json`

---

### Task 1: Add Test Harness and Deployment Asset Guard

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `test/setup.ts`
- Create: `test/harness.test.tsx`
- Create: `playwright.config.ts`
- Create: `e2e/assets.spec.ts`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `npm test`, `npm run test:e2e`, `npm run test:solver`, and DOM test setup used by later tasks.

- [ ] **Step 1: Install pinned test dependencies**

Run:

```bash
npm install --save-dev vitest@3.2.4 jsdom@26.1.0 @testing-library/react@16.3.0 @testing-library/jest-dom@6.6.3 @testing-library/user-event@14.6.1 @playwright/test@1.54.1 vite-tsconfig-paths@5.1.4
```

Expected: dependencies added to `package.json` and `package-lock.json`.

- [ ] **Step 2: Add scripts**

Add to `package.json`:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "test:solver": "cd supabase/functions/optimize-schedule && deno test --allow-read"
  }
}
```

- [ ] **Step 3: Create Vitest configuration**

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.{ts,tsx}'],
    clearMocks: true,
  },
})
```

```ts
// test/setup.ts
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => cleanup())

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})
```

- [ ] **Step 4: Add meaningful harness integration test**

```tsx
// test/harness.test.tsx
import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { cn } from '@/lib/utils'

it('resolves aliases and provides DOM matchers', () => {
  render(<button className={cn('base', false && 'hidden')}>Ready</button>)
  expect(screen.getByRole('button', { name: 'Ready' })).toHaveClass('base')
  expect(screen.getByRole('button', { name: 'Ready' })).not.toHaveClass('hidden')
})
```

- [ ] **Step 5: Create Playwright configuration and asset regression**

```ts
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://127.0.0.1:3000', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run dev -- --hostname 127.0.0.1',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: true,
  },
  projects: [
    { name: 'mobile-safari', use: { ...devices['iPhone 13'] } },
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } },
  ],
})
```

```ts
// e2e/assets.spec.ts
import { expect, test } from '@playwright/test'

const assets = [
  '/cadence-mark.png',
  '/cadence-wordmark.png',
  '/icon-192.png',
  '/icon-512.png',
  '/manifest.webmanifest',
  '/landing/voice.png',
  '/landing/calendar-before.png',
  '/landing/optimizer.png',
  '/landing/calendar-after.png',
  '/landing/messages.png',
]

test('all Emergent-sensitive public assets resolve', async ({ request }) => {
  for (const asset of assets) {
    const response = await request.get(asset)
    expect(response.status(), asset).toBe(200)
  }
})
```

- [ ] **Step 6: Ignore visual companion files**

Append exactly:

```gitignore
.superpowers/
```

Do not edit or delete files under `public/` or `.emergent/`.

- [ ] **Step 7: Run harness**

Run:

```bash
npm test
```

Expected: 1 test PASS.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vitest.config.ts test/setup.ts test/harness.test.tsx playwright.config.ts e2e/assets.spec.ts .gitignore
git commit -m "test: add calendar test harness and asset guard"
```

---

### Task 2: Add Business-Timezone Date and Range Utilities

**Files:**
- Create: `lib/calendar/types.ts`
- Create: `lib/calendar/date.ts`
- Create: `test/calendar/date.test.ts`

**Interfaces:**
- Produces:
  - `CalendarView = 'day' | 'week' | 'month' | 'agenda'`
  - `businessToday(timeZone, now?)`
  - `addBusinessDays(date, amount)`
  - `weekRange(date)`
  - `monthRange(date)`
  - `monthWeekBuckets(date)`
  - `formatBusinessDate(date, locale, options)`

- [ ] **Step 1: Write failing timezone tests**

```ts
// test/calendar/date.test.ts
import { describe, expect, it } from 'vitest'
import { businessToday, monthWeekBuckets, weekRange } from '@/lib/calendar/date'

describe('business calendar dates', () => {
  it('uses business timezone instead of device timezone', () => {
    const now = new Date('2026-07-16T22:30:00.000Z')
    expect(businessToday('Europe/Rome', now)).toBe('2026-07-17')
    expect(businessToday('America/New_York', now)).toBe('2026-07-16')
  })

  it('returns Monday-Sunday week range', () => {
    expect(weekRange('2026-07-16')).toEqual({
      from: '2026-07-13',
      to: '2026-07-19',
    })
  })

  it('splits a month into Monday-Sunday buckets clipped to month', () => {
    expect(monthWeekBuckets('2026-07-16')).toEqual([
      { key: '2026-07-01', from: '2026-07-01', to: '2026-07-05' },
      { key: '2026-07-06', from: '2026-07-06', to: '2026-07-12' },
      { key: '2026-07-13', from: '2026-07-13', to: '2026-07-19' },
      { key: '2026-07-20', from: '2026-07-20', to: '2026-07-26' },
      { key: '2026-07-27', from: '2026-07-27', to: '2026-07-31' },
    ])
  })
})
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
npx vitest run test/calendar/date.test.ts
```

Expected: FAIL because `@/lib/calendar/date` does not exist.

- [ ] **Step 3: Implement types and date utilities**

```ts
// lib/calendar/types.ts
export type CalendarView = 'day' | 'week' | 'month' | 'agenda'
export type DateRange = { from: string; to: string }
export type WeekBucket = DateRange & { key: string }
export type CalendarDensity = number
export type ConstraintLevel = 'hard' | 'warning'

export interface AgendaFilters {
  patientId?: string
  serviceId?: string
  status?: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
}

export interface MoveIntent {
  appointmentId: string
  expectedVersion: number
  date: string
  startMinute: number
}

export interface ResizeIntent {
  appointmentId: string
  expectedVersion: number
  durationMinutes: number
}

export interface CalendarConstraint {
  code: string
  level: ConstraintLevel
  message: string
}
```

Implement `lib/calendar/date.ts` using `Intl.DateTimeFormat(...).formatToParts`
for timezone conversion and UTC-noon arithmetic for date-only strings. Use
Monday index `(day + 6) % 7`; never parse a date-only value with the device
timezone.

Required signatures:

```ts
export function businessToday(timeZone: string, now = new Date()): string
export function addBusinessDays(date: string, amount: number): string
export function weekRange(date: string): DateRange
export function monthRange(date: string): DateRange
export function monthWeekBuckets(date: string): WeekBucket[]
export function formatBusinessDate(
  date: string,
  locale: string,
  options: Intl.DateTimeFormatOptions,
): string
```

- [ ] **Step 4: Run tests**

Run:

```bash
npx vitest run test/calendar/date.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/calendar/types.ts lib/calendar/date.ts test/calendar/date.test.ts
git commit -m "feat: add business timezone calendar dates"
```

---

### Task 3: Add Calendar Geometry, Snap, and Zoom

**Files:**
- Create: `lib/calendar/geometry.ts`
- Create: `test/calendar/geometry.test.ts`

**Interfaces:**
- Produces:
  - `clampDensity(value): number`
  - `snapMinutes(value, interval): number`
  - `minutesToY(minutes, startMinute, density): number`
  - `yToMinutes(y, startMinute, density, interval): number`
  - `zoomAroundFocalPoint(input): { density; scrollTop }`

- [ ] **Step 1: Write failing geometry tests**

```ts
// test/calendar/geometry.test.ts
import { describe, expect, it } from 'vitest'
import {
  clampDensity,
  snapMinutes,
  zoomAroundFocalPoint,
} from '@/lib/calendar/geometry'

describe('calendar geometry', () => {
  it('clamps density to 36-120 px per hour', () => {
    expect(clampDensity(20)).toBe(36)
    expect(clampDensity(60)).toBe(60)
    expect(clampDensity(150)).toBe(120)
  })

  it('snaps to configured interval', () => {
    expect(snapMinutes(548, 15)).toBe(555)
    expect(snapMinutes(548, 10)).toBe(550)
  })

  it('keeps focal time fixed while zooming', () => {
    expect(zoomAroundFocalPoint({
      oldDensity: 60,
      newDensity: 90,
      scrollTop: 300,
      focalY: 200,
    })).toEqual({ density: 90, scrollTop: 550 })
  })
})
```

- [ ] **Step 2: Run test and verify failure**

Run: `npx vitest run test/calendar/geometry.test.ts`

Expected: FAIL because module is missing.

- [ ] **Step 3: Implement minimal pure geometry**

```ts
// lib/calendar/geometry.ts
export const MIN_DENSITY = 36
export const DEFAULT_DENSITY = 60
export const MAX_DENSITY = 120

export function clampDensity(value: number) {
  return Math.min(MAX_DENSITY, Math.max(MIN_DENSITY, value))
}

export function snapMinutes(value: number, interval: number) {
  return Math.round(value / interval) * interval
}

export function minutesToY(minutes: number, startMinute: number, density: number) {
  return ((minutes - startMinute) / 60) * density
}

export function yToMinutes(y: number, startMinute: number, density: number, interval: number) {
  return snapMinutes(startMinute + (y / density) * 60, interval)
}

export function zoomAroundFocalPoint(input: {
  oldDensity: number
  newDensity: number
  scrollTop: number
  focalY: number
}) {
  const density = clampDensity(input.newDensity)
  const contentY = input.scrollTop + input.focalY
  const scaledContentY = contentY * (density / input.oldDensity)
  return { density, scrollTop: Math.max(0, scaledContentY - input.focalY) }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/calendar/geometry.test.ts`

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/calendar/geometry.ts test/calendar/geometry.test.ts
git commit -m "feat: add calendar geometry and zoom math"
```

---

### Task 4: Create Transactional Calendar Mutation RPC

**Files:**
- Create: `supabase/migrations/202607160001_calendar_mutations.sql`
- Create: `app/api/calendar/mutate/route.ts`
- Create: `lib/calendar/constraints.ts`
- Create: `lib/api/calendar.ts`
- Create: `test/calendar/mutations.test.ts`
- Modify: `lib/api/appointments.ts`

**Interfaces:**
- Consumes: `CalendarConstraint` from Task 2.
- Produces:

```ts
export type CalendarMutationOperation =
  | 'create'
  | 'update'
  | 'move'
  | 'resize'
  | 'delete'
  | 'lock'
  | 'unlock'

export interface CalendarMutationRequest {
  businessId: string
  operation: CalendarMutationOperation
  appointmentId?: string
  expectedVersion?: number
  idempotencyKey: string
  confirmWarnings?: string[]
  values: Record<string, unknown>
}

export type CalendarMutationResponse =
  | { ok: true; appointment: CalendarAppointment | null; warnings: CalendarConstraint[] }
  | { ok: false; code: 'HARD_CONSTRAINT' | 'WARNING_CONFIRMATION' | 'STALE_VERSION'; constraints: CalendarConstraint[] }
```

- [ ] **Step 1: Write contract tests**

Mock `fetch` and assert:

```ts
// test/calendar/mutations.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mutateCalendar } from '@/lib/api/calendar'

describe('mutateCalendar', () => {
  afterEach(() => vi.restoreAllMocks())

  it('sends version and idempotency key', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true, appointment: null, warnings: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await mutateCalendar({
      businessId: 'b1',
      operation: 'move',
      appointmentId: 'a1',
      expectedVersion: 3,
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
      values: { appointment_date: '2026-07-17', start_time: '10:00:00' },
    })

    expect(fetchMock).toHaveBeenCalledWith('/api/calendar/mutate', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"expectedVersion":3'),
    }))
  })
})
```

- [ ] **Step 2: Run test and verify failure**

Run: `npx vitest run test/calendar/mutations.test.ts`

Expected: FAIL because `mutateCalendar` is missing.

- [ ] **Step 3: Create SQL schema and RPC**

Migration must:

1. Create `calendar_mutation_requests` with unique `(business_id, idempotency_key)`.
2. Make `optimization_changes.appointment_id` nullable.
3. Add index on active appointments by `(business_id, appointment_date, start_time)`.
4. Create `calendar_validate_mutation(...) returns jsonb` as `security definer`.
5. Inside RPC verify:

```sql
if not exists (
  select 1 from business
  where id = p_business_id
    and profile_id = auth.uid()
    and deleted_at is null
) then
  raise exception 'forbidden' using errcode = '42501';
end if;
```

6. Lock target appointment with `for update`.
7. Reject version mismatch with code `STALE_VERSION`.
8. Evaluate:
   - active appointment overlap using service buffers;
   - locked appointment movement;
   - working-hours windows;
   - closed holidays;
   - positive duration;
   - service `max_daily_bookings`;
   - patient availability as warnings;
   - business `max_daily_appointments` as warning.
9. Return warning codes before mutation unless all warning codes occur in
   `p_confirm_warnings`.
10. Increment `appointments.version`.
11. Set `manual_override=true` when warnings were confirmed.
12. Insert `audit_log` action `create`, `update`, or `delete`.
13. Save and reuse the JSON response for duplicate idempotency keys.

Use stable codes:

```sql
OVERLAP
LOCKED
CLOSED_DAY
HOLIDAY
OUTSIDE_WORKING_HOURS
INVALID_DURATION
SERVICE_DAILY_LIMIT
PATIENT_WEEKDAY_PREFERENCE
PATIENT_TIME_PREFERENCE
BUSINESS_DAILY_TARGET
STALE_VERSION
```

- [ ] **Step 4: Add authenticated route**

`app/api/calendar/mutate/route.ts` must:

```ts
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const body = CalendarMutationRequestSchema.parse(await request.json())
  const { data, error } = await supabase.rpc('calendar_validate_mutation', {
    p_business_id: body.businessId,
    p_operation: body.operation,
    p_appointment_id: body.appointmentId ?? null,
    p_expected_version: body.expectedVersion ?? null,
    p_idempotency_key: body.idempotencyKey,
    p_values: body.values,
    p_confirm_warnings: body.confirmWarnings ?? [],
  })
  if (error) return Response.json({ error: error.message }, { status: 400 })
  return Response.json(data)
}
```

Use Zod to restrict operation values, UUID fields, date `YYYY-MM-DD`, time
`HH:MM`/`HH:MM:SS`, and positive duration.

- [ ] **Step 5: Add client adapter**

Implement `mutateCalendar(request)` in `lib/api/calendar.ts` with `fetch`,
JSON error parsing, and the exact response union above.

Replace `createAppointment`, `updateAppointment`, and `deleteAppointment`
implementations with compatibility wrappers around `mutateCalendar`; keep their
exported names until every existing consumer has migrated.

- [ ] **Step 6: Run tests and typecheck**

Run:

```bash
npx vitest run test/calendar/mutations.test.ts
npx tsc --noEmit
```

Expected: tests PASS; TypeScript emits no new calendar-domain errors.

- [ ] **Step 7: Apply migration to linked development project**

Run:

```bash
supabase db push
```

Expected: both migration changes applied. Verify `calendar_validate_mutation`
exists and `optimization_changes.appointment_id` is nullable.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/202607160001_calendar_mutations.sql app/api/calendar/mutate/route.ts lib/calendar/constraints.ts lib/api/calendar.ts lib/api/appointments.ts test/calendar/mutations.test.ts
git commit -m "feat: add transactional calendar mutations"
```

---

### Task 5: Add Calendar Queries and Configuration

**Files:**
- Create: `lib/calendar/query-keys.ts`
- Modify: `lib/api/calendar.ts`
- Modify: `lib/api/appointments.ts`
- Modify: `lib/types/db.ts`
- Modify: `app/(app)/layout.tsx`

**Interfaces:**
- Produces:

```ts
export interface CalendarConfig {
  timezone: string
  slotIntervalMinutes: number
  defaultDurationMinutes: number
  maxDailyAppointments: number | null
  workingHours: WorkingHour[]
  holidays: Array<{ start_date: string; end_date: string; is_closed: boolean }>
}

export const calendarKeys = {
  all: (businessId: string) => ['calendar', businessId] as const,
  config: (businessId: string) => ['calendar', businessId, 'config'] as const,
  range: (businessId: string, from: string, to: string) =>
    ['calendar', businessId, 'range', from, to] as const,
  agenda: (businessId: string, filters: AgendaFilters) =>
    ['calendar', businessId, 'agenda', filters] as const,
}
```

- [ ] **Step 1: Add version and contact fields to appointment select**

Extend `CalendarAppointment` and `SELECT` with:

```ts
version: number
manual_override: boolean
patients?: {
  first_name: string
  last_name: string | null
  full_name: string | null
  color: string | null
  phone: string | null
  email: string | null
} | null
services?: {
  name: string
  color: string | null
  buffer_before_minutes: number
  buffer_after_minutes: number
  max_daily_bookings: number | null
} | null
```

Filter range reads to statuses `scheduled` and `confirmed`.

- [ ] **Step 2: Add config read**

Implement `getCalendarConfig(businessId)` in `lib/api/calendar.ts` with parallel
Supabase reads of `business`, `working_hours`, and overlapping holidays. Return
the exact `CalendarConfig` shape.

- [ ] **Step 3: Add query keys**

Create `lib/calendar/query-keys.ts` with the interface above and stable,
serializable agenda filters.

- [ ] **Step 4: Keep workspace business fields complete**

Ensure `app/(app)/layout.tsx` still selects:

```text
id, business_name, default_appointment_duration, slot_interval_minutes,
currency, language, timezone, lunch_break_enabled, lunch_start, lunch_end,
max_daily_appointments, default_buffer_minutes
```

Add missing fields to `WorkspaceBusiness`.

- [ ] **Step 5: Verify**

Run:

```bash
npx tsc --noEmit
npm run build
```

Expected: production build succeeds.

- [ ] **Step 6: Commit**

```bash
git add lib/calendar/query-keys.ts lib/api/calendar.ts lib/api/appointments.ts lib/types/db.ts app/'(app)'/layout.tsx lib/workspace-context.tsx
git commit -m "feat: add calendar queries and configuration"
```

---

### Task 6: Add Pure Calendar Controller

**Files:**
- Create: `lib/calendar/controller.ts`
- Create: `test/calendar/controller.test.ts`

**Interfaces:**
- Consumes: `CalendarView`, date range helpers.
- Produces:

```ts
export interface CalendarState {
  view: CalendarView
  selectedDate: string
  density: number
  selectedAppointmentId: string | null
  createAt: { date: string; startMinute: number } | null
}

export type CalendarAction =
  | { type: 'select-date'; date: string }
  | { type: 'set-view'; view: CalendarView }
  | { type: 'set-density'; density: number }
  | { type: 'select-appointment'; id: string | null }
  | { type: 'create-at'; value: CalendarState['createAt'] }

export function calendarReducer(state: CalendarState, action: CalendarAction): CalendarState
export function visibleRange(state: CalendarState): DateRange
```

- [ ] **Step 1: Write failing reducer tests**

```ts
// test/calendar/controller.test.ts
import { describe, expect, it } from 'vitest'
import { calendarReducer, visibleRange } from '@/lib/calendar/controller'

const state = {
  view: 'day' as const,
  selectedDate: '2026-07-16',
  density: 60,
  selectedAppointmentId: null,
  createAt: null,
}

it('switches to week without losing selected date', () => {
  const next = calendarReducer(state, { type: 'set-view', view: 'week' })
  expect(next.selectedDate).toBe('2026-07-16')
  expect(visibleRange(next)).toEqual({ from: '2026-07-13', to: '2026-07-19' })
})

it('clamps density', () => {
  expect(calendarReducer(state, { type: 'set-density', density: 999 }).density).toBe(120)
})
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run test/calendar/controller.test.ts`

Expected: missing module.

- [ ] **Step 3: Implement reducer and range selection**

Use `weekRange`, `monthRange`, and a 31-day range beginning at selected date for
Agenda’s first page. Persist view and density under:

```text
cadence.calendar.view
cadence.calendar.density
```

Storage access remains outside the pure reducer.

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/calendar/controller.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/calendar/controller.ts test/calendar/controller.test.ts
git commit -m "feat: add calendar controller state"
```

---

### Task 7: Extract Desktop Renderer and Introduce Controller Component

**Files:**
- Create: `components/calendar/calendar-controller.tsx`
- Create: `components/calendar/desktop-week-calendar.tsx`
- Modify: `components/calendar/calendar-client.tsx`
- Modify: `app/(app)/calendar/page.tsx`

**Interfaces:**
- Consumes: controller reducer, query keys, calendar config.
- Produces:

```ts
export interface CalendarRendererProps {
  appointments: CalendarAppointment[]
  config: CalendarConfig
  selectedDate: string
  density: number
  onSelectDate(date: string): void
  onSelectAppointment(id: string): void
  onCreateAt(date: string, startMinute: number): void
  onMove(request: MoveIntent): void
  onResize(request: ResizeIntent): void
}
```

- [ ] **Step 1: Move current desktop JSX without behavior changes**

Copy the detailed week grid and desktop HTML5 drag code from
`calendar-client.tsx` into `desktop-week-calendar.tsx`. Replace local query and
dialog ownership with `CalendarRendererProps`.

- [ ] **Step 2: Create controller component**

`CalendarController` must:

- initialize business-local today;
- restore valid saved view/density;
- compute active range;
- query appointments using `calendarKeys.range`;
- query config using `calendarKeys.config`;
- retain previous data with `placeholderData`;
- prefetch previous and next ranges;
- select desktop or mobile renderer through CSS/media query;
- own quick sheet, form, move sheet, and optimize overlay state.

- [ ] **Step 3: Make `CalendarClient` a compatibility wrapper**

```tsx
// components/calendar/calendar-client.tsx
'use client'

import { CalendarController } from './calendar-controller'

export function CalendarClient() {
  return <CalendarController />
}
```

- [ ] **Step 4: Verify desktop manually**

Run:

```bash
npm run dev
```

Check at 1440×900:

- week navigation;
- today;
- create;
- edit;
- desktop drag;
- optimizer dialog;
- Calendar/Waiting List switch.

- [ ] **Step 5: Run build**

Run: `npm run build`

Expected: successful Next standalone build.

- [ ] **Step 6: Commit**

```bash
git add components/calendar/calendar-controller.tsx components/calendar/desktop-week-calendar.tsx components/calendar/calendar-client.tsx app/'(app)'/calendar/page.tsx
git commit -m "refactor: extract desktop calendar renderer"
```

---

### Task 8: Build Mobile Toolbar, Date Strip, and Day View

**Files:**
- Create: `components/calendar/calendar-toolbar.tsx`
- Create: `components/calendar/mobile-date-strip.tsx`
- Create: `components/calendar/appointment-card.tsx`
- Create: `components/calendar/mobile-day-calendar.tsx`
- Create: `test/calendar/mobile-day.test.tsx`
- Modify: `components/calendar/calendar-controller.tsx`
- Modify: `lib/i18n/dictionaries.ts`

**Interfaces:**
- Produces a semantic Day renderer with no horizontal page scroll.

- [ ] **Step 1: Write failing component test**

```tsx
// test/calendar/mobile-day.test.tsx
import { render, screen } from '@testing-library/react'
import { MobileDayCalendar } from '@/components/calendar/mobile-day-calendar'

const testConfig = {
  timezone: 'Europe/Rome',
  slotIntervalMinutes: 15,
  defaultDurationMinutes: 30,
  maxDailyAppointments: null,
  workingHours: [{
    id: 'wh1',
    business_id: 'b1',
    weekday: 'thursday' as const,
    is_open: true,
    morning_start: '09:00:00',
    morning_end: '13:00:00',
    afternoon_start: '14:00:00',
    afternoon_end: '18:00:00',
  }],
  holidays: [],
}

it('renders semantic appointments and current view date', () => {
  render(
    <MobileDayCalendar
      appointments={[{
        id: 'a1',
        appointment_date: '2026-07-16',
        start_time: '09:15:00',
        end_time: '10:00:00',
        duration_minutes: 45,
        status: 'scheduled',
        color: '#6d4bd8',
        title: 'Physio',
        price: 50,
        patient_id: 'p1',
        service_id: 's1',
        locked: false,
        version: 1,
        manual_override: false,
        patients: { first_name: 'Marco', last_name: 'Rossi', full_name: 'Marco Rossi', color: null, phone: null, email: null },
        services: { name: 'Physio', color: '#6d4bd8', buffer_before_minutes: 0, buffer_after_minutes: 0, max_daily_bookings: null },
      }]}
      config={testConfig}
      selectedDate="2026-07-16"
      density={60}
      onSelectAppointment={() => {}}
      onCreateAt={() => {}}
      onMove={() => {}}
      onResize={() => {}}
    />,
  )
  expect(screen.getByRole('button', {
    name: /09:15, Marco Rossi, Physio, 45 minutes/i,
  })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run test/calendar/mobile-day.test.tsx`

Expected: component missing.

- [ ] **Step 3: Implement toolbar and date strip**

Toolbar controls:

- localized month/date title;
- Today;
- view menu: Day, Week, Month, Agenda;
- contextual Optimize.

Date strip:

- seven 44×44 minimum buttons;
- separate today and selected states;
- left/right keyboard support;
- horizontal scrolling only inside strip.

- [ ] **Step 4: Implement Day renderer**

Requirements:

- use config-derived start/end range;
- default density 60;
- use semantic `<button>` cards;
- show time, client, service, duration, and status;
- add current-time line only for business-local today;
- click blank timeline creates using configured snap;
- auto-scroll once per selected date;
- no `min-w-[880px]`;
- no touch drag yet.

- [ ] **Step 5: Add translations**

Add EN/IT/ES keys for:

```text
cal.view.month
cal.view.agenda
cal.optimize.day
cal.optimize.week
cal.optimize.month
cal.optimize.range
cal.currentTime
cal.closed
cal.moreAppointments
```

- [ ] **Step 6: Run tests and build**

Run:

```bash
npx vitest run test/calendar/mobile-day.test.tsx
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add components/calendar/calendar-toolbar.tsx components/calendar/mobile-date-strip.tsx components/calendar/appointment-card.tsx components/calendar/mobile-day-calendar.tsx components/calendar/calendar-controller.tsx test/calendar/mobile-day.test.tsx lib/i18n/dictionaries.ts
git commit -m "feat: add mobile day calendar"
```

---

### Task 9: Extract Appointment Form and Add Quick Sheet

**Files:**
- Create: `components/calendar/appointment-form.tsx`
- Create: `components/calendar/appointment-quick-sheet.tsx`
- Create: `components/calendar/move-appointment-sheet.tsx`
- Create: `test/calendar/quick-sheet.test.tsx`
- Modify: `components/calendar/appointment-dialog.tsx`
- Modify: `components/calendar/calendar-controller.tsx`
- Modify: `components/app-shell/app-shell.tsx`

**Interfaces:**
- Produces:

```ts
export interface AppointmentFormProps {
  businessId: string
  appointment?: CalendarAppointment | null
  defaultDate?: string
  defaultStart?: string
  defaultPatientId?: string
  onSaved(appointmentId: string): void
  onCancel(): void
}
```

- [ ] **Step 1: Write quick-sheet test**

```tsx
// test/calendar/quick-sheet.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { AppointmentQuickSheet } from '@/components/calendar/appointment-quick-sheet'

const appointment = {
  id: 'a1',
  appointment_date: '2026-07-16',
  start_time: '09:15:00',
  end_time: '10:00:00',
  duration_minutes: 45,
  status: 'scheduled',
  color: '#6d4bd8',
  title: 'Physio',
  price: 50,
  patient_id: 'p1',
  service_id: 's1',
  locked: false,
  version: 1,
  manual_override: false,
  patients: {
    first_name: 'Marco',
    last_name: 'Rossi',
    full_name: 'Marco Rossi',
    color: null,
    phone: '+393331234567',
    email: 'marco@example.com',
  },
  services: {
    name: 'Physio',
    color: '#6d4bd8',
    buffer_before_minutes: 0,
    buffer_after_minutes: 0,
    max_daily_bookings: null,
  },
}

it('shows Google-style quick actions', async () => {
  const onMove = vi.fn()
  render(<AppointmentQuickSheet open appointment={appointment} onOpenChange={() => {}} onMove={onMove} onEdit={() => {}} onToggleLock={() => {}} onDuplicate={() => {}} onDelete={() => {}} />)
  expect(screen.getByText('Marco Rossi')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /move/i }))
  expect(onMove).toHaveBeenCalled()
})
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run test/calendar/quick-sheet.test.tsx`

Expected: missing component.

- [ ] **Step 3: Extract form body**

Move form state, queries, voice parsing, patient creation, availability, and
advance-list logic from `AppointmentDialog` into `AppointmentForm`.

Keep primary fields visible. Wrap availability and advance controls in a
collapsed “More options” section.

- [ ] **Step 4: Keep desktop dialog API**

`AppointmentDialog` becomes a shell around `AppointmentForm`; existing callers
need no prop changes.

- [ ] **Step 5: Implement quick sheet**

Use existing `components/ui/drawer.jsx`, not global Dialog. Show:

- client/service color and names;
- date/time/duration;
- phone/email;
- lock state;
- Call, Move, Lock/Unlock, Edit;
- Duplicate and Delete;
- labelled close button.

- [ ] **Step 6: Implement explicit move sheet**

Use date, time, and duration controls. Submit through `mutateCalendar` with
operation `move`; handle warning confirmation by showing the server warning list
and resubmitting with exact warning codes.

- [ ] **Step 7: Lazy-load shell quick-create overlays**

Use `next/dynamic` for appointment, client, and voice overlays in AppShell so
calendar refactor does not increase every authenticated route bundle.

- [ ] **Step 8: Test**

Run:

```bash
npx vitest run test/calendar/quick-sheet.test.tsx
npm run build
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add components/calendar/appointment-form.tsx components/calendar/appointment-quick-sheet.tsx components/calendar/move-appointment-sheet.tsx components/calendar/appointment-dialog.tsx components/calendar/calendar-controller.tsx components/app-shell/app-shell.tsx test/calendar/quick-sheet.test.tsx
git commit -m "feat: add appointment quick sheet"
```

---

### Task 10: Add Optimistic Move/Resize, Touch Gestures, and Undo

**Files:**
- Modify: `components/calendar/mobile-day-calendar.tsx`
- Modify: `components/calendar/appointment-card.tsx`
- Create: `hooks/use-calendar-gesture.ts`
- Modify: `components/calendar/calendar-controller.tsx`
- Modify: `lib/api/calendar.ts`
- Create: `test/calendar/gesture.test.ts`

**Interfaces:**
- Consumes: `MoveIntent` and `ResizeIntent` from `lib/calendar/types.ts`.
- Produces: gesture state and optimistic mutation lifecycle.

- [ ] **Step 1: Write gesture state-machine tests**

Test:

- movement before 450 ms cancels long press;
- activation at 450 ms enters move mode;
- resize uses lower handle only;
- `pointercancel` returns idle;
- touch scrolling over a card before activation remains allowed.

Use fake timers and a pure reducer exported from
`hooks/use-calendar-gesture.ts`.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run test/calendar/gesture.test.ts`

Expected: missing hook.

- [ ] **Step 3: Implement Pointer Events gesture hook**

Use:

- `setPointerCapture`;
- 450 ms activation;
- 8 px cancellation threshold;
- refs for live coordinates;
- `requestAnimationFrame` for previews;
- edge auto-scroll;
- `navigator.vibrate(15)` on activation when available;
- `touch-action: pan-y` before activation;
- duration-aware bounds.

- [ ] **Step 4: Add resize handle**

Render a minimum 44 px accessible resize target at card bottom while keeping its
visual handle compact. Announce live values through `aria-live`:

```text
10:15–11:00, 45 minutes
```

- [ ] **Step 5: Add optimistic mutation**

Controller mutation lifecycle:

1. cancel overlapping calendar queries;
2. snapshot every overlapping range;
3. update appointment locally;
4. call mutation endpoint;
5. replace with canonical server row;
6. rollback snapshots on failure;
7. show warning-confirmation sheet when required;
8. invalidate config-sensitive ranges after settle.

- [ ] **Step 6: Add Undo**

Store canonical pre-mutation values and version. Toast Undo submits a new
operation with a new UUID idempotency key and current expected version.

- [ ] **Step 7: Run tests**

Run:

```bash
npx vitest run test/calendar/gesture.test.ts test/calendar/mutations.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add components/calendar/mobile-day-calendar.tsx components/calendar/appointment-card.tsx hooks/use-calendar-gesture.ts components/calendar/calendar-controller.tsx lib/api/calendar.ts test/calendar/gesture.test.ts
git commit -m "feat: add safe calendar drag and resize"
```

---

### Task 11: Add Vertical Pinch Zoom

**Files:**
- Create: `components/calendar/calendar-zoom-controls.tsx`
- Create: `hooks/use-pinch-zoom.ts`
- Modify: `components/calendar/mobile-day-calendar.tsx`
- Modify: `components/calendar/calendar-controller.tsx`

**Interfaces:**
- Consumes geometry functions from Task 3.
- Produces pinch, `−`, `+`, reset, and persisted density.

- [ ] **Step 1: Implement pinch hook**

Track exactly two active pointers. Calculate scale from pointer distance and use
`zoomAroundFocalPoint` to preserve focal time. Ignore pinch while a drag or
resize gesture is active.

- [ ] **Step 2: Add controls**

Buttons:

- decrement 12 px/hour;
- increment 12 px/hour;
- reset to 60 px/hour.

Each button has localized accessible text.

- [ ] **Step 3: Persist density**

Read/write:

```text
cadence.calendar.density
```

Validate stored number through `clampDensity`.

- [ ] **Step 4: Test**

Extend `test/calendar/geometry.test.ts` with:

- 36 lower bound;
- 120 upper bound;
- exact reset 60;
- focal time remains within 0.5 minutes after repeated zoom.

Run: `npx vitest run test/calendar/geometry.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/calendar/calendar-zoom-controls.tsx hooks/use-pinch-zoom.ts components/calendar/mobile-day-calendar.tsx components/calendar/calendar-controller.tsx test/calendar/geometry.test.ts
git commit -m "feat: add calendar pinch zoom"
```

---

### Task 12: Add Week Overview and Responsive Multi-Day Views

**Files:**
- Create: `components/calendar/mobile-week-overview.tsx`
- Create: `components/calendar/tablet-multi-day-calendar.tsx`
- Modify: `components/calendar/calendar-controller.tsx`
- Modify: `components/calendar/calendar-toolbar.tsx`

**Interfaces:**
- Produces phone Week overview and 3-/7-day detailed responsive layouts.

- [ ] **Step 1: Add pure day metrics**

Create helpers in `lib/calendar/controller.ts`:

```ts
export interface DayCapacitySummary {
  date: string
  appointmentCount: number
  bookedMinutes: number
  idleMinutes: number
  gapCount: number
  closed: boolean
}
```

Idle calculation counts recoverable gaps between first and last appointment,
excluding closure/lunch spans, matching solver semantics.

- [ ] **Step 2: Implement phone Week overview**

Each day is a 44 px minimum button and shows:

- localized day/date;
- appointment count;
- booked hours;
- idle/gaps;
- closed/holiday;
- up to three service/status markers.

Tap selects date and switches to Day.

- [ ] **Step 3: Implement multi-day renderer**

Reuse Day geometry:

- 3 columns for phone landscape/tablet portrait;
- 7 columns for tablet landscape/desktop alternate;
- same cards, quick sheet, move/resize, and zoom.

- [ ] **Step 4: Verify responsive behavior**

Use browser at:

```text
390×844 portrait -> Day/Week overview
844×390 landscape -> 3-day grid
820×1180 portrait -> 3-day grid
1180×820 landscape -> 7-day grid
```

- [ ] **Step 5: Commit**

```bash
git add components/calendar/mobile-week-overview.tsx components/calendar/tablet-multi-day-calendar.tsx components/calendar/calendar-controller.tsx components/calendar/calendar-toolbar.tsx lib/calendar/controller.ts
git commit -m "feat: add responsive week calendar views"
```

---

### Task 13: Add Mobile Month View

**Files:**
- Create: `lib/calendar/month.ts`
- Create: `components/calendar/mobile-month-calendar.tsx`
- Create: `test/calendar/month.test.ts`
- Create: `test/calendar/mobile-month.test.tsx`
- Modify: `components/calendar/calendar-controller.tsx`

**Interfaces:**
- Produces:

```ts
export interface MonthCell {
  date: string
  inMonth: boolean
  isToday: boolean
  isSelected: boolean
  visibleIndicators: CalendarAppointment[]
  hiddenCount: number
}
```

- [ ] **Step 1: Write month helper tests**

Assert July 2026 returns 42 cells, Monday-first; a day with five appointments has
two visible indicators and `hiddenCount=3`.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run test/calendar/month.test.ts`

Expected: module missing.

- [ ] **Step 3: Implement month helpers**

Use date-only UTC-noon arithmetic. Sort appointments by start time. Never render
more than two indicators per cell.

- [ ] **Step 4: Implement Month UI**

- swipe only on month grid;
- tap day selects and opens mini-agenda;
- tap mini-agenda card opens quick sheet;
- second tap on selected day header switches to Day;
- today and selected have distinct styles;
- `+N` is text, not color-only.

- [ ] **Step 5: Run tests**

Run:

```bash
npx vitest run test/calendar/month.test.ts test/calendar/mobile-month.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/calendar/month.ts components/calendar/mobile-month-calendar.tsx test/calendar/month.test.ts test/calendar/mobile-month.test.tsx components/calendar/calendar-controller.tsx
git commit -m "feat: add mobile month calendar"
```

---

### Task 14: Add Infinite Agenda and Filters

**Files:**
- Create: `lib/calendar/agenda.ts`
- Create: `components/calendar/calendar-agenda.tsx`
- Create: `test/calendar/agenda.test.ts`
- Modify: `lib/api/calendar.ts`
- Modify: `components/calendar/calendar-controller.tsx`

**Interfaces:**
- Consumes: `AgendaFilters` from `lib/calendar/types.ts`.
- Produces:

```ts
export interface AgendaPage {
  appointments: CalendarAppointment[]
  nextCursor: { date: string; startTime: string; id: string } | null
}
```

- [ ] **Step 1: Write pagination/grouping tests**

Test stable ordering by date, time, id; sticky-day grouping; cursor excludes the
last returned row; filters serialize deterministically.

- [ ] **Step 2: Implement API**

Use 30-row keyset pagination:

```text
(appointment_date, start_time, id) > cursor
```

Apply optional patient, service, and status filters. Default excludes soft
deleted rows.

- [ ] **Step 3: Implement Agenda**

Use `useInfiniteQuery`, IntersectionObserver sentinel, sticky day headers,
semantic appointment buttons, and filter controls. Selecting a card opens quick
sheet.

- [ ] **Step 4: Run tests**

Run:

```bash
npx vitest run test/calendar/agenda.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/calendar/agenda.ts components/calendar/calendar-agenda.tsx test/calendar/agenda.test.ts lib/api/calendar.ts components/calendar/calendar-controller.tsx
git commit -m "feat: add calendar agenda view"
```

---

### Task 15: Secure Optimizer, Add Snapshots, and Atomic Apply

**Files:**
- Create: `supabase/migrations/202607160002_optimization_snapshots.sql`
- Modify: `supabase/functions/optimize-schedule/index.ts`
- Modify: `supabase/functions/optimize-schedule/solver/types.ts`
- Modify: `supabase/functions/optimize-schedule/solver/load.ts`
- Modify: `supabase/functions/optimize-schedule/solver/persist.ts`
- Modify: `lib/api/scheduler.ts`
- Create: `app/api/calendar/optimize/apply/route.ts`
- Modify: `components/calendar/optimize-preview.tsx`
- Modify: `lib/api/optimization-history.ts`

**Interfaces:**
- Produces:

```ts
export interface OptimizationApplyRequest {
  businessId: string
  runIds: string[]
  selectedChangeIds: string[]
  idempotencyKey: string
}
```

- [ ] **Step 1: Add run snapshot schema**

Migration adds to `optimization_runs`:

```sql
batch_id uuid,
scope_kind text not null default 'custom',
scope_from date,
scope_to date,
week_key date,
allow_cross_week boolean not null default false,
schedule_snapshot jsonb not null default '{}'::jsonb
```

Add `created_appointment_id uuid` to `optimization_changes`.

Create `apply_optimization_batch(...) returns jsonb` that:

- verifies business ownership with `auth.uid()`;
- locks selected runs and affected appointments;
- compares current appointment versions against `schedule_snapshot`;
- validates selected changes as one final set;
- creates waiting-list appointments and stores `created_appointment_id`;
- moves existing appointments with version increment;
- updates waiting-list matches;
- marks selected changes accepted and non-selected changes deleted;
- marks runs accepted;
- writes audit log rows;
- commits all or none;
- reuses idempotent response.

- [ ] **Step 2: Authenticate Edge Function**

In `index.ts`:

1. Read bearer token from `Authorization`.
2. Create anon client with bearer token.
3. Call `auth.getUser()`.
4. Return 401 when missing/invalid.
5. With service client, verify `business.profile_id === user.id`.
6. Ignore caller-supplied `profile_id`; persist authenticated `user.id`.

- [ ] **Step 3: Persist snapshot**

Extend solver `Appointment` with `version`, select it in `load.ts`, and pass
loaded appointment versions to `persistOutput`. Store:

```json
{
  "appointments": {
    "<appointment-id>": 3
  }
}
```

Also persist `batch_id`, scope, week key, and cross-week flag from request args.

- [ ] **Step 4: Replace browser sequential apply**

Remove `acceptChange`, `rejectChange`, and loop-based `applyChanges` from active
UI usage. Add one request to `/api/calendar/optimize/apply`.

- [ ] **Step 5: Fix undo for waiting-list creates**

Use `optimization_changes.created_appointment_id` in history undo. Undo itself
must call a transaction RPC and version-check affected rows.

- [ ] **Step 6: Verify**

Run:

```bash
npm run test:solver
npm run build
```

Expected: 9 existing solver tests PASS; build PASS.

- [ ] **Step 7: Deploy**

Run:

```bash
supabase db push
supabase functions deploy optimize-schedule
```

Expected: migration applied and Edge Function deployed.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/202607160002_optimization_snapshots.sql supabase/functions/optimize-schedule/index.ts supabase/functions/optimize-schedule/solver/types.ts supabase/functions/optimize-schedule/solver/load.ts supabase/functions/optimize-schedule/solver/persist.ts lib/api/scheduler.ts app/api/calendar/optimize/apply/route.ts components/calendar/optimize-preview.tsx lib/api/optimization-history.ts
git commit -m "fix: make optimizer apply atomic and tenant safe"
```

---

### Task 16: Add Contextual Optimization and Week-Isolated Month Runs

**Files:**
- Create: `app/api/calendar/optimize/route.ts`
- Create: `components/calendar/contextual-optimize-dialog.tsx`
- Create: `test/calendar/contextual-optimize.test.ts`
- Create: `supabase/functions/optimize-schedule/fixtures/i_month_week_isolation.json`
- Modify: `supabase/functions/optimize-schedule/solver/types.ts`
- Modify: `supabase/functions/optimize-schedule/solver/core.ts`
- Modify: `supabase/functions/optimize-schedule/test/core.test.ts`
- Modify: `components/calendar/calendar-controller.tsx`
- Modify: `components/scheduler/scheduler-client.tsx`
- Modify: `lib/api/scheduler.ts`
- Modify: `lib/i18n/dictionaries.ts`

**Interfaces:**
- Produces:

```ts
export interface ContextualOptimizationRequest {
  businessId: string
  scope: 'day' | 'week' | 'month' | 'custom'
  dateFrom: string
  dateTo: string
  allowCrossWeek: boolean
  maxCrossWeekDays: number
}

export interface ContextualOptimizationResponse {
  batchId: string
  runs: Array<{ runId: string; weekKey: string | null; from: string; to: string }>
}
```

- [ ] **Step 1: Write orchestration tests**

Mock Edge Function invocation:

- Day invokes once for same date.
- Week invokes once Monday–Sunday.
- Month with `allowCrossWeek=false` invokes once per clipped week bucket.
- Month with `allowCrossWeek=true` invokes once for whole month with max days.
- invalid max days 0 or 32 returns 400.

- [ ] **Step 2: Implement route**

Authenticate user, verify business ownership, derive server-side ranges from
scope, generate one `batchId`, and invoke Edge Function with:

```json
{
  "business_id": "...",
  "date_from": "2026-07-13",
  "date_to": "2026-07-19",
  "batch_id": "...",
  "scope_kind": "month",
  "week_key": "2026-07-13",
  "allow_cross_week": false,
  "max_cross_week_days": 7
}
```

- [ ] **Step 3: Enforce week isolation in solver**

Add context fields:

```ts
scope_kind?: 'day' | 'week' | 'month' | 'custom'
week_key?: string | null
allow_cross_week?: boolean
max_cross_week_days?: number
```

Candidate dates for any existing appointment must satisfy:

```ts
if (scope_kind === 'month' && !allow_cross_week) {
  return weekRange(candidateDate) === weekRange(originDate)
}
if (scope_kind === 'month' && allow_cross_week) {
  return Math.abs(dayDiff(originDate, candidateDate)) <= maxCrossWeekDays
}
```

Keep existing same-day compaction behavior; add cross-day candidate generation
only for contextual month optimization.

- [ ] **Step 4: Add solver fixture and test**

Fixture contains an appointment Monday 2026-07-13 and an attractive free slot
Friday 2026-07-10. Assert default month solve never moves across week. Duplicate
input with cross-week enabled and assert any move stays within seven days.

- [ ] **Step 5: Build grouped preview**

Dialog groups runs and changes by `weekKey`, shows cross-week state prominently,
and applies selected changes from all runs through one atomic request.

- [ ] **Step 6: Add Scheduler setting**

Add advanced setting:

- “Allow moves between weeks” default false.
- “Maximum displacement” number input 1–31, default 7.

Persist in `algorithm_settings.metadata`:

```json
{
  "ALLOW_CROSS_WEEK": false,
  "MAX_CROSS_WEEK_DAYS": 7
}
```

- [ ] **Step 7: Run all relevant tests**

Run:

```bash
npx vitest run test/calendar/contextual-optimize.test.ts
npm run test:solver
npm run build
```

Expected: all PASS.

- [ ] **Step 8: Deploy solver**

Run: `supabase functions deploy optimize-schedule`

Expected: deployed successfully.

- [ ] **Step 9: Commit**

```bash
git add app/api/calendar/optimize/route.ts components/calendar/contextual-optimize-dialog.tsx test/calendar/contextual-optimize.test.ts supabase/functions/optimize-schedule/fixtures/i_month_week_isolation.json supabase/functions/optimize-schedule/solver/types.ts supabase/functions/optimize-schedule/solver/core.ts supabase/functions/optimize-schedule/test/core.test.ts components/calendar/calendar-controller.tsx components/scheduler/scheduler-client.tsx lib/api/scheduler.ts lib/i18n/dictionaries.ts
git commit -m "feat: add contextual month optimization"
```

---

### Task 17: Finish Accessibility, PWA Orientation, and End-to-End Verification

**Files:**
- Create: `e2e/mobile-calendar.spec.ts`
- Modify: `public/manifest.webmanifest`
- Modify: `app/layout.tsx`
- Modify: `app/(app)/calendar/page.tsx`
- Modify: `components/calendar/*.tsx` only where audit finds exact issues

**Interfaces:**
- Produces verified mobile experience and final release gate.

- [ ] **Step 1: Write E2E flow**

`e2e/mobile-calendar.spec.ts` logs into demo account and verifies:

1. phone starts in Day;
2. no horizontal document overflow;
3. Month and Agenda switch correctly;
4. quick sheet opens from appointment;
5. Move flow changes time and Undo restores it;
6. resize changes duration but service default remains unchanged;
7. locked appointment cannot move;
8. zoom controls reach 36, reset 60, reach 120;
9. landscape layout shows three detailed days;
10. optimizer label changes with active view.

Use demo credentials from existing handoff only in local test configuration:

```text
test@cadence.com
Cadence!
```

- [ ] **Step 2: Remove portrait lock**

Delete only:

```json
"orientation": "portrait",
```

from `public/manifest.webmanifest`. Do not move or rename manifest/icons.

- [ ] **Step 3: Add iOS viewport fit**

Set viewport:

```ts
export const viewport: Viewport = {
  themeColor: '#6d4bd8',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}
```

- [ ] **Step 4: Accessibility audit fixes**

Verify and fix:

- every icon button has an accessible name;
- Calendar/Waiting List uses `role="tablist"`, `role="tab"`, `aria-selected`;
- all touch targets are at least 44×44;
- appointment cards expose time/client/service/duration;
- status has visible text/icon, not color alone;
- focus returns to appointment after closing quick sheet;
- reduced motion removes lift/slide animations;
- keyboard shortcuts ignore `input`, `textarea`, `select`, `button`, links, and
  `[contenteditable]`.

- [ ] **Step 5: Run full verification**

Run:

```bash
npm test
npm run test:solver
npm run build
npm run test:e2e
```

Expected:

- all Vitest tests PASS;
- all Deno solver tests PASS;
- Next build PASS;
- mobile-calendar and asset Playwright projects PASS.

- [ ] **Step 6: Verify standalone asset copy**

Run:

```bash
test -f .next/standalone/public/landing/calendar-before.png
test -f .next/standalone/public/cadence-mark.png
test -f .next/standalone/public/manifest.webmanifest
git diff --name-status HEAD~1 -- public .emergent
```

Expected: first three commands exit 0; diff shows only in-place manifest edit,
no rename/delete under `public/`, and no `.emergent/` changes.

- [ ] **Step 7: Manual device checklist**

Verify:

- iPhone SE/15 Pro/Pro Max Safari and installed PWA;
- Pixel Chrome;
- iPad portrait/landscape;
- device timezone different from business timezone;
- Europe/Rome DST boundary;
- offline read-only state;
- network loss during move;
- concurrent edit and stale optimizer preview;
- keyboard-only, VoiceOver/TalkBack, 200% zoom, reduced motion.

- [ ] **Step 8: Commit**

```bash
git add e2e/mobile-calendar.spec.ts public/manifest.webmanifest app/layout.tsx app/'(app)'/calendar/page.tsx components/calendar
git commit -m "test: verify mobile calendar experience"
```

---

## Final Handoff

After Task 17:

1. Capture 2–4 final phone screenshots:
   - Day view;
   - Month or Agenda;
   - quick appointment sheet;
   - optimization preview.
2. Add them under `public/landing/` without moving existing images.
3. Start a separate brainstorming/spec cycle for landing-page changes.
4. Continue roadmap with “Free my afternoon/day,” then optional routing, then
   Google Calendar integration.
