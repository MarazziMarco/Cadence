# Routing and Free-Period Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce travel feasibility, add Balanced and Smart Route strategies, and implement atomic free-day/free-afternoon optimization.

**Architecture:** Resolve and cache locations/routes before the pure solver, inject a directed travel matrix into solver input, add route-aware hard constraints and objectives, and apply routing-sensitive results only as exact validated plans.

**Tech Stack:** Supabase Edge Functions/Deno, TypeScript, PostgreSQL, OpenRouteService, Next.js API routes, React, Vitest, Deno tests.

## Global Constraints

- Depends on the client/appointment location model from migration 004.
- OpenRouteService is the only remote provider; there is no paid fallback.
- Walk when actual walking duration is at most 9 minutes; otherwise drive.
- Unknown studio legs use 20 minutes; unknown external-to-external legs block.
- Travel feasibility is hard for optimizer and manual calendar mutations.
- Balanced never moves solely for route savings.
- Smart Route may move solely for at least 10 saved travel minutes and no idle
  regression.
- Free-period moves stay inside the same Monday–Sunday week.
- Routing-sensitive plans are exact plans; arbitrary change deselection is off.
- Preserve `.claude/settings.local.json`.

---

### Task 1: Add routing settings, cache, and run metadata schema

**Files:**
- Create: `supabase/migrations/202607160005_routing_and_free_period.sql`
- Modify: `lib/types/db.ts`
- Test: `test/calendar/routing-sql.test.ts`

**Interfaces:**

```ts
type OptimizationStrategy = 'balanced' | 'smart_route'
type OptimizationGoal = 'optimize' | 'free_period'
```

- [ ] **Step 1: Write failing SQL assertions**

Assert tenant-scoped `route_cache`, strategy/goal/run metrics, excluded-period
metadata, blocker JSON, exact-plan flag, and RLS policies.

- [ ] **Step 2: Verify failure**

Run: `npx vitest run test/calendar/routing-sql.test.ts`

- [ ] **Step 3: Create migration**

Use a unique directed key of business, origin hash, destination hash, and
profile. Store duration, distance, provider, fetched/expiry timestamps. Add
run columns for travel/distance before/after, strategy, goal, completion state,
blockers, and location snapshot hash.

- [ ] **Step 4: Verify and commit**

```bash
npx vitest run test/calendar/routing-sql.test.ts
git add supabase/migrations/202607160005_routing_and_free_period.sql lib/types/db.ts test/calendar/routing-sql.test.ts
git commit -m "feat: add routing cache and optimization metadata"
```

### Task 2: Implement pure location resolution and route selection

**Files:**
- Create: `supabase/functions/optimize-schedule/routing/types.ts`
- Create: `supabase/functions/optimize-schedule/routing/location.ts`
- Create: `supabase/functions/optimize-schedule/routing/mode.ts`
- Create: `supabase/functions/optimize-schedule/test/routing-location.test.ts`

**Interfaces:**

```ts
interface ResolvedLocation {
  key: string
  source: 'studio' | 'patient' | 'custom'
  latitude: number | null
  longitude: number | null
  addressHash: string | null
}

function resolveAppointmentLocation(input: LocationResolutionInput): ResolvedLocation
function chooseTravelMode(walkingSeconds: number | null, thresholdMinutes: number): 'foot-walking' | 'driving-car'
```

- [ ] **Step 1: Write failing pure tests**

Cover mode precedence, inherited fallback, missing-all-to-studio, studio key
equality, walking 9:00, walking 9:01, and explicit unresolved custom/patient.

- [ ] **Step 2: Verify failure**

Run: `deno test supabase/functions/optimize-schedule/test/routing-location.test.ts --allow-read`

- [ ] **Step 3: Implement pure functions**

Never call network or database code from these modules. Hash normalized address
input without logging it.

- [ ] **Step 4: Verify and commit**

```bash
deno test supabase/functions/optimize-schedule/test/routing-location.test.ts --allow-read
git add supabase/functions/optimize-schedule/routing supabase/functions/optimize-schedule/test/routing-location.test.ts
git commit -m "feat: resolve scheduler locations and travel modes"
```

### Task 3: Add ORS provider, cache, and matrix preparation

**Files:**
- Create: `supabase/functions/optimize-schedule/routing/provider.ts`
- Create: `supabase/functions/optimize-schedule/routing/cache.ts`
- Create: `supabase/functions/optimize-schedule/routing/matrix.ts`
- Modify: `supabase/functions/optimize-schedule/index.ts`
- Test: `supabase/functions/optimize-schedule/test/routing-matrix.test.ts`
- Modify: `supabase/functions/optimize-schedule/README.md`

**Interfaces:**

```ts
interface TravelLeg {
  seconds: number
  meters: number
  mode: 'studio' | 'fallback' | 'foot-walking' | 'driving-car'
  verifiable: boolean
}

type TravelMatrix = Record<string, Record<string, TravelLeg>>
```

- [ ] **Step 1: Write failing provider/cache tests**

Mock `fetch` and Supabase calls. Cover cache hit, directed keys, expiry,
geocoding, walking-first for plausible close points, driving fallback, ORS
quota error with fresh cache, unknown studio 20-minute fallback, and blocked
external route without cache.

- [ ] **Step 2: Verify failure**

Run: `deno test supabase/functions/optimize-schedule/test/routing-matrix.test.ts --allow-read --allow-env`

- [ ] **Step 3: Implement server-only provider**

Read `OPENROUTESERVICE_API_KEY` from `Deno.env`. Do not include it or raw
addresses in thrown messages. Batch matrix requests and limit geocoding to
unresolved address hashes.

- [ ] **Step 4: Inject matrix before solving**

Change `index.ts` orchestration to:

```ts
const input = await loadInput(...)
const routedInput = await prepareRoutingInput(supabase, input, routingConfig)
const output = solveCore(routedInput)
```

- [ ] **Step 5: Document environment and verify**

Run the routing tests and expect PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/optimize-schedule/routing supabase/functions/optimize-schedule/index.ts supabase/functions/optimize-schedule/test/routing-matrix.test.ts supabase/functions/optimize-schedule/README.md
git commit -m "feat: prepare cached ORS travel matrices"
```

### Task 4: Enforce travel feasibility and travel-adjusted idle

**Files:**
- Modify: `supabase/functions/optimize-schedule/solver/types.ts`
- Modify: `supabase/functions/optimize-schedule/solver/load.ts`
- Modify: `supabase/functions/optimize-schedule/solver/core.ts`
- Test: `supabase/functions/optimize-schedule/test/core.test.ts`

**Interfaces:**
- `Appointment` gains `location_key`.
- `SolverInput` gains `studio_location_key`, `travel_matrix`, `strategy`, and
  route thresholds.

- [ ] **Step 1: Add failing solver fixtures/tests**

Test rejection of insufficient travel, acceptance when lunch absorbs travel,
first and last studio legs, route-unavailable blocker, and idle equal to
`gap - required travel`.

- [ ] **Step 2: Verify failure**

Run: `deno test supabase/functions/optimize-schedule/test/core.test.ts --allow-read`

- [ ] **Step 3: Implement hard sequence feasibility**

After placing a candidate, sort the day and validate depot-first, every
consecutive leg, and last-depot. Return false for unverifiable required legs.

- [ ] **Step 4: Add route-aware candidate boundaries**

Generate starts at predecessor end plus travel and before successor start minus
travel plus appointment footprint.

- [ ] **Step 5: Correct idle metrics and verify**

Run the core suite and expect PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/optimize-schedule/solver/types.ts supabase/functions/optimize-schedule/solver/load.ts supabase/functions/optimize-schedule/solver/core.ts supabase/functions/optimize-schedule/test/core.test.ts
git commit -m "feat: enforce travel time in schedule feasibility"
```

### Task 5: Add Balanced and Smart Route objectives

**Files:**
- Modify: `supabase/functions/optimize-schedule/solver/core.ts`
- Modify: `supabase/functions/optimize-schedule/solver/types.ts`
- Modify: `supabase/functions/optimize-schedule/solver/explain.ts`
- Test: `supabase/functions/optimize-schedule/test/core.test.ts`

**Interfaces:**

```ts
interface RouteMetrics {
  travelMinutes: number
  distanceMeters: number
}
```

- [ ] **Step 1: Write failing strategy tests**

Use deterministic fixtures where a reorder saves 9 minutes and another saves
10. Assert Balanced keeps the baseline, Smart rejects 9, Smart accepts 10, and
route-only acceptance never increases idle.

- [ ] **Step 2: Verify failure**

Run: `deno test supabase/functions/optimize-schedule/test/core.test.ts --allow-read`

- [ ] **Step 3: Implement route metrics and neighborhoods**

Add route relocation, swap, feasible insertion, and within-day 2-opt to the
existing time-boxed loop. Keep deterministic seeded ordering.

- [ ] **Step 4: Add explanations and verify**

Explain saved travel without exposing addresses. Run the core suite and expect
PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/optimize-schedule/solver/core.ts supabase/functions/optimize-schedule/solver/types.ts supabase/functions/optimize-schedule/solver/explain.ts supabase/functions/optimize-schedule/test/core.test.ts
git commit -m "feat: add smart route optimization strategy"
```

### Task 6: Persist routing snapshots and require exact-plan apply

**Files:**
- Modify: `supabase/functions/optimize-schedule/solver/persist.ts`
- Extend: `supabase/migrations/202607160005_routing_and_free_period.sql`
- Modify: `app/api/calendar/optimize/apply/route.ts`
- Modify: `lib/api/scheduler.ts`
- Test: `test/calendar/optimization-apply.test.ts`

**Interfaces:**

```ts
interface ExactOptimizationApplyRequest {
  businessId: string
  runIds: string[]
  exactPlan: true
  idempotencyKey: string
}
```

- [ ] **Step 1: Write failing apply tests**

Test that route-sensitive runs reject partial selected IDs, stale appointment
versions, changed location hashes, expired/unverifiable required routes, and
combined final schedules without sufficient travel.

- [ ] **Step 2: Verify failure**

Run: `npx vitest run test/calendar/optimization-apply.test.ts`

- [ ] **Step 3: Persist snapshots and implement exact apply**

Snapshot versions, location hashes, matrix identity, exact change IDs, and
before/after metrics. Revalidate under the existing advisory lock before any
write.

- [ ] **Step 4: Verify and commit**

```bash
npx vitest run test/calendar/optimization-apply.test.ts
git add supabase/functions/optimize-schedule/solver/persist.ts supabase/migrations/202607160005_routing_and_free_period.sql app/api/calendar/optimize/apply/route.ts lib/api/scheduler.ts test/calendar/optimization-apply.test.ts
git commit -m "feat: apply routing plans atomically"
```

### Task 7: Enforce travel on manual calendar mutations

**Files:**
- Create: `app/api/calendar/travel-feasibility.ts`
- Modify: `app/api/calendar/mutate/route.ts`
- Extend: `supabase/migrations/202607160005_routing_and_free_period.sql`
- Modify: `lib/calendar/constraints.ts`
- Test: `test/calendar/mutation-api-route.test.ts`
- Test: `test/calendar/mutation-sql.test.ts`

**Interfaces:**
- Adds hard constraint code `INSUFFICIENT_TRAVEL_TIME`.
- The API preloads/cache-resolves required neighboring legs before invoking the
  transactional RPC.

- [ ] **Step 1: Write failing mutation tests**

Test manual create/move/resize rejects impossible travel, accepts sufficient
travel, treats studio-to-studio as zero, and does not permit warning override
for insufficient travel.

- [ ] **Step 2: Verify failure**

Run: `npx vitest run test/calendar/mutation-api-route.test.ts test/calendar/mutation-sql.test.ts`

- [ ] **Step 3: Implement prefetch plus transactional validation**

Pass cache identifiers/expected durations to the RPC, lock affected days, and
revalidate neighboring appointments before mutation.

- [ ] **Step 4: Verify and commit**

```bash
npx vitest run test/calendar/mutation-api-route.test.ts test/calendar/mutation-sql.test.ts
git add app/api/calendar/travel-feasibility.ts app/api/calendar/mutate/route.ts supabase/migrations/202607160005_routing_and_free_period.sql lib/calendar/constraints.ts test/calendar/mutation-api-route.test.ts test/calendar/mutation-sql.test.ts
git commit -m "feat: validate travel on calendar changes"
```

### Task 8: Implement free-day and free-afternoon solver goals

**Files:**
- Modify: `supabase/functions/optimize-schedule/solver/types.ts`
- Modify: `supabase/functions/optimize-schedule/solver/core.ts`
- Modify: `supabase/functions/optimize-schedule/index.ts`
- Create: `supabase/functions/optimize-schedule/fixtures/j_free_period.json`
- Test: `supabase/functions/optimize-schedule/test/core.test.ts`
- Modify: `lib/calendar/contextual-optimization.ts`

**Interfaces:**

```ts
interface ExcludedPeriod {
  date: string
  startMinute: number
  endMinute: number
}

type FreePeriodCompletion = 'complete' | 'partial' | 'impossible'
```

- [ ] **Step 1: Write failing solver tests**

Cover complete day, configured afternoon start, 14:00 fallback, same-week
boundary, locked blocker, unavailable client, route blocker, maximum-cardinality
partial result, and disabled waiting-list fill.

- [ ] **Step 2: Verify failure**

Run: `deno test supabase/functions/optimize-schedule/test/core.test.ts --allow-read`

- [ ] **Step 3: Implement evacuation search**

Load the entire containing week, hard-exclude the period, order target
appointments by fewest feasible placements, first search complete evacuation,
then maximum safe partial placement with blocker codes.

- [ ] **Step 4: Verify and commit**

```bash
deno test supabase/functions/optimize-schedule/test/core.test.ts --allow-read
git add supabase/functions/optimize-schedule/solver/types.ts supabase/functions/optimize-schedule/solver/core.ts supabase/functions/optimize-schedule/index.ts supabase/functions/optimize-schedule/fixtures/j_free_period.json supabase/functions/optimize-schedule/test/core.test.ts lib/calendar/contextual-optimization.ts
git commit -m "feat: free a day or afternoon safely"
```

### Task 9: Add Scheduler route settings and free-period UI

**Files:**
- Modify: `components/scheduler/scheduler-client.tsx`
- Modify: `lib/api/scheduler.ts`
- Create: `components/calendar/free-period-dialog.tsx`
- Modify: `components/calendar/calendar-controller.tsx`
- Modify: `components/calendar/appointment-quick-sheet.tsx`
- Modify: `components/calendar/moved-messages.tsx`
- Modify: `lib/i18n/dictionaries.ts`
- Test: `test/calendar/free-period-dialog.test.tsx`
- Test: `test/calendar/calendar-controller.test.tsx`

**Interfaces:**
- Scheduler metadata keys:
  `OPTIMIZATION_STRATEGY`, `WALK_MAX_MINUTES`,
  `UNKNOWN_STUDIO_LEG_MINUTES`, `SMART_ROUTE_MIN_SAVING_MINUTES`.
- `runFreePeriodOptimization({ businessId, date, kind })`.

- [ ] **Step 1: Write failing UI/controller tests**

Assert strategy settings persist, route KPI preview renders, day/afternoon
actions send the correct week/excluded period, complete preview has Apply/Cancel,
partial preview shows blockers and the exact Italian question, and successful
apply renders moved messages.

- [ ] **Step 2: Verify failure**

Run: `npx vitest run test/calendar/free-period-dialog.test.tsx test/calendar/calendar-controller.test.tsx`

- [ ] **Step 3: Implement settings and dialogs**

Default to Balanced, 9, 20, and 10. Add the free-period actions to the selected
day/quick-sheet calendar affordance without crowding the main toolbar.

- [ ] **Step 4: Disable arbitrary change toggles**

When `run.exact_plan` is true, show the complete plan and blockers without
per-change checkboxes.

- [ ] **Step 5: Verify and commit**

```bash
npx vitest run test/calendar/free-period-dialog.test.tsx test/calendar/calendar-controller.test.tsx
git add components/scheduler/scheduler-client.tsx lib/api/scheduler.ts components/calendar/free-period-dialog.tsx components/calendar/calendar-controller.tsx components/calendar/appointment-quick-sheet.tsx components/calendar/moved-messages.tsx lib/i18n/dictionaries.ts test/calendar/free-period-dialog.test.tsx test/calendar/calendar-controller.test.tsx
git commit -m "feat: expose route strategy and free period actions"
```

### Task 10: Deploy and verify routing

- [ ] **Step 1: Configure environment**

Set `OPENROUTESERVICE_API_KEY` as a Supabase Edge Function secret. Do not place
it in `NEXT_PUBLIC_*`, source, fixtures, or logs.

- [ ] **Step 2: Apply migrations and deploy the Edge Function**

```bash
supabase db push
supabase functions deploy optimize-schedule
```

Expected: migration 004 precedes 005 and deployment succeeds.

- [ ] **Step 3: Run solver and app verification**

```bash
deno test supabase/functions/optimize-schedule/test --allow-read --allow-env
npm test -- --run --pool=threads --maxWorkers=1 --no-file-parallelism
npm run build
```

Expected: all suites pass and build exits 0.

- [ ] **Step 4: Add one E2E story**

Extend `e2e/mobile-calendar.spec.ts` with a free-afternoon partial-result flow
and exact apply confirmation. Run when the configured browser is installed.

- [ ] **Step 5: Commit deployment/test changes**

```bash
git add supabase/functions/optimize-schedule/README.md e2e/mobile-calendar.spec.ts
git commit -m "test: verify routing and free period flows"
```

