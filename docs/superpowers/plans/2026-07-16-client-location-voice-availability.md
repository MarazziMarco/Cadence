# Client Location, Voice, and Availability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional client/appointment locations, robust voice-created clients and addresses, and six per-weekday availability states.

**Architecture:** Reuse existing business/patient address columns, add explicit appointment location columns, replace the flat parser result with patient resolution and availability patches, and keep all writes behind validated/transactional APIs.

**Tech Stack:** Next.js, React, TypeScript, Supabase/Postgres migrations and RPCs, Zod, Vitest, Testing Library.

## Global Constraints

- Missing location resolves to studio and zero studio-to-studio travel.
- Spoken unqualified addresses belong to the appointment; explicit “client
  lives at” language belongs to the client.
- Unknown spoken names are proposals, not immediate database writes.
- Ambiguous names require explicit resolution.
- Availability uses business working windows, falling back to 09:00–13:00 and
  14:00–18:00.
- Hard availability and soft preference semantics must remain distinct.
- Never leave an orphan client after failed/cancelled appointment creation.
- Preserve `.claude/settings.local.json`.

---

### Task 1: Add appointment-location and availability schema

**Files:**
- Create: `supabase/migrations/202607160004_client_locations_and_availability.sql`
- Modify: `lib/types/db.ts`
- Test: `test/calendar/mutation-sql.test.ts`

**Interfaces:**
- Adds appointment fields:

```ts
type AppointmentLocationMode = 'inherit' | 'studio' | 'patient' | 'custom'
```

- Adds `patient_availability.is_available boolean not null default true`.

- [ ] **Step 1: Write failing SQL text assertions**

Assert the migration adds `location_mode`, custom address/coordinate/geocode
fields, the mode check constraint, and `is_available`.

- [ ] **Step 2: Verify failure**

Run: `npx vitest run test/calendar/mutation-sql.test.ts`

Expected: FAIL because migration 004 does not exist.

- [ ] **Step 3: Write the migration**

Use nullable address/coordinate fields, `location_mode default 'inherit'`, and
a check requiring address text for `custom`. Add indexes only for
`business_id` plus geocode status/hash lookups.

- [ ] **Step 4: Extend TypeScript row types**

Expose existing `business.address/city/postal_code` and
`patients.address/city/postal_code`, and add all new appointment fields.

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run test/calendar/mutation-sql.test.ts`

```bash
git add supabase/migrations/202607160004_client_locations_and_availability.sql lib/types/db.ts test/calendar/mutation-sql.test.ts
git commit -m "feat: add client and appointment location schema"
```

### Task 2: Extend validated calendar mutations

**Files:**
- Modify: `supabase/migrations/202607160004_client_locations_and_availability.sql`
- Modify: `lib/calendar/mutation-request.ts`
- Modify: `lib/api/appointments.ts`
- Modify: `lib/api/calendar.ts`
- Test: `test/calendar/mutation-route.test.ts`
- Test: `test/calendar/mutation-api-route.test.ts`
- Test: `test/calendar/queries.test.ts`

**Interfaces:**

```ts
interface AppointmentLocationValues {
  location_mode?: AppointmentLocationMode
  location_address?: string | null
  location_city?: string | null
  location_postal_code?: string | null
}
```

- [ ] **Step 1: Write failing contract tests**

Test create/update accepts location fields, `move` rejects them, invalid modes
fail Zod, and appointment queries return client plus appointment location data.

- [ ] **Step 2: Verify failure**

Run: `npx vitest run test/calendar/mutation-route.test.ts test/calendar/mutation-api-route.test.ts test/calendar/queries.test.ts`

- [ ] **Step 3: Extend Zod, SQL allowlists, variables, insert/update and return**

Normalize blank strings to `null`. Reject `patient` mode when the selected
patient lacks a stored location and reject empty `custom` mode.

- [ ] **Step 4: Verify and commit**

Run the three focused files and expect PASS.

```bash
git add supabase/migrations/202607160004_client_locations_and_availability.sql lib/calendar/mutation-request.ts lib/api/appointments.ts lib/api/calendar.ts test/calendar/mutation-route.test.ts test/calendar/mutation-api-route.test.ts test/calendar/queries.test.ts
git commit -m "feat: validate appointment locations"
```

### Task 3: Expose studio and client addresses

**Files:**
- Modify: `lib/workspace-context.tsx`
- Modify: `lib/api/working-hours.ts`
- Modify: `lib/api/patients.ts`
- Modify: `components/settings/preferences-client.tsx`
- Modify: `components/patients/patient-form-dialog.tsx`
- Modify: `components/patients/patient-profile.tsx`
- Modify: `lib/i18n/dictionaries.ts`
- Test: `test/patients/patient-location.test.tsx`
- Test: `test/settings/studio-location.test.tsx`

**Interfaces:**

```ts
interface PostalAddressInput {
  address: string
  city: string
  postalCode: string
}
```

- [ ] **Step 1: Add failing form tests**

Assert settings saves studio address, patient form saves client address, blank
values become `null`, and the profile displays the effective stored address.

- [ ] **Step 2: Verify failure**

Run: `npx vitest run test/patients/patient-location.test.tsx test/settings/studio-location.test.tsx`

- [ ] **Step 3: Implement forms and queries**

Add localized address/city/postal inputs. Add a one-time “Use approximate
current position” action using `navigator.geolocation.getCurrentPosition`,
round coordinates before storing, and never watch position.

- [ ] **Step 4: Verify and commit**

```bash
npx vitest run test/patients/patient-location.test.tsx test/settings/studio-location.test.tsx
git add lib/workspace-context.tsx lib/api/working-hours.ts lib/api/patients.ts components/settings/preferences-client.tsx components/patients/patient-form-dialog.tsx components/patients/patient-profile.tsx lib/i18n/dictionaries.ts test/patients/patient-location.test.tsx test/settings/studio-location.test.tsx
git commit -m "feat: edit studio and client locations"
```

### Task 4: Implement six-state recurring availability

**Files:**
- Modify: `lib/api/patients.ts`
- Create: `components/patients/patient-availability-editor.tsx`
- Modify: `components/calendar/appointment-form.tsx`
- Modify: `supabase/functions/optimize-schedule/solver/time.ts`
- Modify: `supabase/functions/optimize-schedule/solver/types.ts`
- Modify: `supabase/functions/optimize-schedule/solver/load.ts`
- Modify: `supabase/migrations/202607160004_client_locations_and_availability.sql`
- Test: `test/patients/availability-editor.test.tsx`
- Test: `supabase/functions/optimize-schedule/test/time.test.ts`

**Interfaces:**

```ts
type DayAvailabilityState =
  | 'unavailable'
  | 'all_day'
  | 'morning_only'
  | 'afternoon_only'
  | 'prefer_morning'
  | 'prefer_afternoon'

type WeeklyAvailability = Record<Weekday, DayAvailabilityState>
```

- [ ] **Step 1: Write failing solver and editor tests**

Test every state, weekday-specific business windows, fallback windows, explicit
unavailable rows, and that high-priority rows affect preference scoring without
expanding hard feasibility.

- [ ] **Step 2: Verify failure**

Run:

```bash
deno test supabase/functions/optimize-schedule/test/time.test.ts --allow-read
npx vitest run test/patients/availability-editor.test.tsx
```

- [ ] **Step 3: Implement read/write helpers**

Add:

```ts
getPatientWeeklyAvailability(patientId, workingHours)
replacePatientWeeklyAvailability(patientId, weekly, workingHours)
mergePatientWeeklyAvailability(patientId, patch, workingHours)
```

Write unavailable rows explicitly. Write normal rows for hard windows and
nested high rows for preferences.

- [ ] **Step 4: Correct solver and SQL feasibility**

Filter hard feasibility through `is_available` and normal rows. Treat high rows
only in preference scoring. Mirror the rule in manual appointment warnings.

- [ ] **Step 5: Verify and commit**

Run both focused suites and expect PASS.

```bash
git add lib/api/patients.ts components/patients/patient-availability-editor.tsx components/calendar/appointment-form.tsx supabase/functions/optimize-schedule/solver/time.ts supabase/functions/optimize-schedule/solver/types.ts supabase/functions/optimize-schedule/solver/load.ts supabase/migrations/202607160004_client_locations_and_availability.sql test/patients/availability-editor.test.tsx supabase/functions/optimize-schedule/test/time.test.ts
git commit -m "feat: add per-day client availability"
```

### Task 5: Replace the voice parser contract

**Files:**
- Modify: `lib/voice/parse-appointment.ts`
- Create: `test/voice/parse-appointment.test.ts`

**Interfaces:**

```ts
type PatientResolution =
  | { kind: 'existing'; id: string; displayName: string; storedAddress: string | null }
  | { kind: 'new'; proposedName: string }
  | { kind: 'ambiguous'; proposedName: string; candidateIds: string[] }
  | { kind: 'none' }

interface AvailabilityPatch {
  mode: 'merge' | 'replace'
  days: Partial<Record<WeekdayName, DayAvailabilityState>>
}
```

- [ ] **Step 1: Write parser tests first**

Cover IT/EN existing and new names, duplicate-name ambiguity, accented and
hyphenated names, appointment versus client address anchors, combined
addresses, `alle 15`, merge availability, `solo` replacement, hard negation,
and soft preferences.

- [ ] **Step 2: Verify failure**

Run: `npx vitest run test/voice/parse-appointment.test.ts`

- [ ] **Step 3: Implement span-based parsing**

Resolve date/time/service/duration/address/availability spans first, remove
them from the name candidate, then resolve exact full name, unique partial
name, ambiguity, or a validated new-client proposal.

- [ ] **Step 4: Verify and commit**

```bash
npx vitest run test/voice/parse-appointment.test.ts
git add lib/voice/parse-appointment.ts test/voice/parse-appointment.test.ts
git commit -m "feat: parse new clients addresses and availability"
```

### Task 6: Add safe voice and manual location previews

**Files:**
- Modify: `components/ai/voice-appointment.tsx`
- Modify: `components/calendar/appointment-form.tsx`
- Modify: `components/demo/demo-calendar.tsx`
- Create: `components/calendar/appointment-location-fields.tsx`
- Modify: `lib/i18n/dictionaries.ts`
- Test: `test/voice/voice-appointment.test.tsx`
- Test: `test/calendar/appointment-dialog.test.tsx`

**Interfaces:**
- Consumes the new `ParsedAppt`.
- Produces editable patient resolution, client address, appointment location,
  and seven-day availability preview.

- [ ] **Step 1: Write failing UI tests**

Assert unknown voice name pre-fills “Nuovo cliente”, ambiguity disables create,
appointment address defaults to custom, client-address language shows an
update-confirmation control, and parsed availability highlights changed days.

- [ ] **Step 2: Verify failure**

Run: `npx vitest run test/voice/voice-appointment.test.tsx test/calendar/appointment-dialog.test.tsx`

- [ ] **Step 3: Implement shared location fields**

Offer `Automatico`, `Studio`, `Cliente`, `Personalizzato`. Show a read-only
effective source/address label. Keep explicit client-address overwrite behind
a checkbox/confirmation.

- [ ] **Step 4: Update all parser consumers**

Use the same patient-resolution and location preview in Voice, appointment
form microphone input, and demo behavior.

- [ ] **Step 5: Verify and commit**

```bash
npx vitest run test/voice/voice-appointment.test.tsx test/calendar/appointment-dialog.test.tsx
git add components/ai/voice-appointment.tsx components/calendar/appointment-form.tsx components/demo/demo-calendar.tsx components/calendar/appointment-location-fields.tsx lib/i18n/dictionaries.ts test/voice/voice-appointment.test.tsx test/calendar/appointment-dialog.test.tsx
git commit -m "feat: preview voice clients and locations"
```

### Task 7: Make client plus appointment creation atomic

**Files:**
- Extend: `supabase/migrations/202607160004_client_locations_and_availability.sql`
- Create: `app/api/calendar/create-with-client/route.ts`
- Create: `lib/calendar/create-with-client-request.ts`
- Modify: `lib/api/appointments.ts`
- Modify: `components/ai/voice-appointment.tsx`
- Modify: `components/calendar/appointment-form.tsx`
- Test: `test/calendar/create-with-client-route.test.ts`

**Interfaces:**

```ts
interface CreateAppointmentWithClientRequest {
  businessId: string
  patient: { firstName: string; lastName?: string | null; address?: PostalAddressInput | null } | { id: string }
  appointment: AppointmentValues
  availability?: AvailabilityPatch
  idempotencyKey: string
}
```

- [ ] **Step 1: Write failing route/RPC tests**

Test successful atomic creation, warning response without persisted client,
cancelled warning without orphan, invalid appointment rollback, and idempotent
retry.

- [ ] **Step 2: Verify failure**

Run: `npx vitest run test/calendar/create-with-client-route.test.ts`

- [ ] **Step 3: Implement transactional RPC and API route**

Inside one transaction, validate ownership, create/update the client, write
availability, invoke the same appointment validation rules, and return the
appointment plus patient. Do not duplicate soft-warning semantics.

- [ ] **Step 4: Switch consumers and verify**

Run the focused route and UI tests. Expect zero orphan rows in failure cases.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/202607160004_client_locations_and_availability.sql app/api/calendar/create-with-client/route.ts lib/calendar/create-with-client-request.ts lib/api/appointments.ts components/ai/voice-appointment.tsx components/calendar/appointment-form.tsx test/calendar/create-with-client-route.test.ts
git commit -m "feat: create voice clients and appointments atomically"
```

### Task 8: Full client/location verification

- [ ] **Step 1: Run focused verification**

```bash
npx vitest run test/voice test/patients test/settings test/calendar/create-with-client-route.test.ts test/calendar/mutation-route.test.ts test/calendar/appointment-dialog.test.tsx
deno test supabase/functions/optimize-schedule/test/time.test.ts --allow-read
```

- [ ] **Step 2: Run full project gates**

```bash
npm test -- --run --pool=threads --maxWorkers=1 --no-file-parallelism
npm run build
```

Expected: all tests pass and build exits 0.

- [ ] **Step 3: Commit any test-only adjustments**

```bash
git add test supabase/functions/optimize-schedule/test
git commit -m "test: verify client locations voice and availability"
```

