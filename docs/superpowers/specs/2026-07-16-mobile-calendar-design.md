# Cadence Mobile Calendar Redesign

Date: 2026-07-16

Status: approved design

Scope: calendar experience, calendar mutations, and contextual optimization

## 1. Purpose

Replace the current desktop calendar squeezed into a horizontally scrolling
mobile canvas with a dedicated mobile experience inspired by Google Calendar.
Cadence must retain its own focus: appointment businesses, schedule
optimization, client constraints, waiting-list workflows, and explicit control
over every change.

The redesign must:

- work as an installable mobile web app;
- preserve the current desktop calendar;
- support fast touch interactions without accidental moves;
- add day, week, month, and agenda views;
- support drag, duration resize, and vertical zoom;
- validate every mutation against scheduling constraints;
- keep all existing image paths and Emergent deployment directories unchanged.

## 2. Scope Boundaries

### Included

- Responsive calendar architecture.
- Mobile day, week overview, month, and agenda views.
- Tablet multi-day views.
- Appointment quick-detail sheet.
- Mobile drag-to-move and drag-to-resize.
- Explicit move flow as a non-gesture alternative.
- Vertical calendar zoom.
- Contextual optimization by active view.
- Atomic, authenticated, constraint-aware calendar mutations.
- Business-timezone handling.
- Accessibility, error handling, performance, and regression tests.

### Deferred

- Patient addresses and route optimization.
- Google Calendar synchronization.
- Native iOS or Android application.
- Landing-page implementation and final screenshots.
- Offline mutation queues.

The redesigned calendar will later provide the screenshots for a landing-page
section such as “Works like an app.” New screenshots may be added under
`public/landing/`, but existing assets will not be moved or renamed.

## 3. Existing Problems

The current calendar:

- renders both day and week inside a forced `min-width: 880px` canvas;
- defaults to week view on a phone;
- hard-codes 07:00–21:00 and 15-minute slots;
- uses browser-local dates instead of the business timezone;
- writes appointment moves directly from the browser;
- does not validate overlaps, closures, buffers, locks, or other constraints;
- uses a fragile 300 ms touch long-press with `touch-action: none`;
- provides no agenda or month view;
- has no duration-resize interaction;
- has no current-time line or vertical zoom;
- duplicates the mobile create action between the page and global bottom bar.

## 4. Chosen Architecture

Use one shared calendar controller with separate desktop, tablet, and mobile
renderers.

### 4.1 Shared controller

`CalendarController` owns:

- selected date;
- active view;
- visible and queried date ranges;
- appointments and day buckets;
- calendar configuration;
- selection and overlay state;
- create, move, resize, delete, and undo intents;
- zoom density;
- contextual optimization scope;
- adjacent-range prefetching.

The controller exposes intent callbacks. Renderers do not write to Supabase
directly.

### 4.2 Renderers

- `DesktopWeekCalendar`
- `TabletMultiDayCalendar`
- `MobileDayCalendar`
- `MobileWeekOverview`
- `MobileMonthCalendar`
- `CalendarAgenda`

The existing desktop renderer is extracted with minimal behavioral change
before mobile work begins. This reduces regression risk.

### 4.3 Shared components

- `CalendarToolbar`
- `MobileDateStrip`
- `AppointmentCard`
- `AppointmentQuickSheet`
- `AppointmentForm`
- `MoveAppointmentSheet`
- `OptimizePreview`

`AppointmentForm` is presentation-independent. Desktop hosts it in the current
dialog; mobile hosts it in a full-height sheet with sticky actions. The existing
`AppointmentDialog` public API remains compatible because the app shell and
patient profile also use it.

Global dialog primitives must not be changed to achieve the mobile layout.

### 4.4 Data flow

```text
Workspace
  -> CalendarController
  -> range/config queries
  -> normalized appointment data
  -> active renderer
  -> user intent
  -> authenticated validation endpoint
  -> transactional mutation
  -> precise cache update or rollback
```

## 5. Responsive Experience

### 5.1 Phone portrait: under 640 px

- Default view: Day.
- Available views: Day, Week, Month, Agenda.
- Existing bottom navigation remains.
- Global bottom-bar `+` is the primary create action.
- Duplicate page-level “New appointment” action is hidden.
- Create and edit use mobile sheets.

### 5.2 Tablet and phone landscape: 640–1023 px

- Phone landscape: detailed three-day view.
- Tablet portrait: detailed three-day view.
- Tablet landscape: detailed seven-day week.

### 5.3 Desktop: 1024 px and above

- Sidebar remains.
- Detailed seven-day calendar remains.
- Desktop HTML drag-and-drop remains during migration, then gains the shared
  validation and mutation path.

Interaction capability should also consider coarse-pointer input. Width alone
must not enable precision drag behavior on touch devices.

### 5.4 PWA orientation

Remove the manifest’s portrait-only restriction. Do not move or rename the
manifest, icons, screenshots, or any directory under `public/` or `.emergent/`.

## 6. Calendar Views

### 6.1 Day

Day is the default phone view.

It contains:

- compact sticky toolbar;
- horizontally scrollable seven-day date strip;
- full-width vertical timeline;
- sticky time rail;
- business-hours-aware visible range;
- current-time line;
- auto-scroll to the current time, or first appointment when viewing another
  date;
- tap on an empty slot to create an appointment;
- tap on an appointment to open its quick sheet.

The timeline may reveal closed time outside normal hours only when required to
display an existing exceptional appointment.

### 6.2 Week

Phone portrait uses a seven-day capacity overview rather than seven narrow
editable columns.

Each day shows:

- appointment count;
- booked duration;
- recoverable idle time or gap count;
- service/status indicators;
- closed or holiday state.

Tapping a day opens Day view. The view provides the contextual “Optimize week”
action.

Detailed week layouts are available on tablet landscape and desktop.

### 6.3 Month

Month uses a compact seven-column grid.

- Show at most two event indicators per day.
- Show `+N` when more appointments exist.
- Distinguish today and selected day.
- A first tap selects the day and opens a mini-agenda below the grid.
- Tapping an appointment opens the quick sheet.
- Tapping the selected day’s header opens Day view.
- Horizontal swipe changes month.

Month must remain usable with high appointment density and must not render every
appointment card inside every cell.

### 6.4 Agenda

Agenda is a continuous upcoming-appointments list:

- grouped by day;
- progressively loaded;
- filterable by client, service, and status;
- equipped with sticky date headings;
- fully operable without drag or precision tapping.

Agenda is the canonical accessible alternative to the graphical calendar.

## 7. Appointment Quick Sheet

Tapping an appointment opens a Google-Calendar-inspired bottom sheet.

It shows:

- client;
- service;
- date;
- start and end time;
- duration;
- status and lock state;
- telephone and email when available;
- location when available in a future location-enabled phase.

Primary actions:

- Call.
- Move.
- Lock or unlock.
- Edit.

Secondary actions are Duplicate and Delete. Delete requires explicit
confirmation.

The sheet closes through downward swipe or a labelled close control. Editing
opens the full appointment form. “Move” enters an explicit move flow, ensuring
that every operation remains possible without drag gestures.

## 8. Appointment Form

The form uses progressive disclosure.

Primary fields:

- client;
- service;
- date;
- start time;
- duration.

“More options” contains:

- recurring client availability;
- preferred time of day;
- “move up if an earlier slot opens.”

Mobile uses a full-height sheet with sticky Save and Cancel actions. The form
must protect against accidental dismissal when unsaved changes exist.

## 9. Drag, Move, and Resize

### 9.1 Move

- Drag the appointment body to change day or start time.
- Mobile dragging activates through a deliberate long press.
- Natural vertical scrolling remains the default gesture.
- Moving the finger before activation cancels the long press.
- Active drag uses pointer capture and a lifted appointment preview.
- Edge proximity triggers controlled auto-scroll.
- Haptic feedback is used when supported.
- The preview shows target date, start, end, and duration.

### 9.2 Resize

- Drag the lower handle to change duration.
- Duration is free rather than locked to the service default.
- The change affects only that appointment.
- The service’s default duration remains unchanged.
- Duration must remain positive and align with the configured snap interval.

### 9.3 Snap

Drag and resize snap to the business calendar interval, supporting at least:

- 5 minutes;
- 10 minutes;
- 15 minutes;
- 30 minutes.

### 9.4 Undo

Successful move and resize operations show an Undo action. Undo sends a new,
validated inverse mutation; it does not merely restore local UI state.

## 10. Vertical Zoom

The detailed time grid supports Google-Calendar-style vertical zoom.

- Default density: 60 pixels per hour.
- Range: 36–120 pixels per hour.
- Two-finger pinch adjusts density continuously.
- The time under the gesture’s focal point remains visually anchored.
- `−` and `+` controls provide an accessible alternative.
- Double tap or Reset restores 60 pixels per hour.
- Density persists on the current device.
- Zoom affects only presentation, never appointment data, snap, or duration.

## 11. Constraint Policy

All calendar mutations use a shared constraint evaluator.

### 11.1 Hard blocks

- appointment overlap;
- locked appointment movement;
- closed business day;
- holiday closure;
- outside business working hours;
- required service buffers;
- non-positive duration;
- rigid service booking limits.

### 11.2 Confirmable warnings

- client preferred weekday violation;
- client preferred time violation;
- scheduling on a discouraged day;
- exceeding the business’s soft daily appointment target.

A confirmed warning is stored as a manual override with its reason and actor.

`max_daily_appointments` is treated as a soft warning for manual editing.
Service-specific hard limits remain blocking. The optimizer continues to respect
its configured budgets and does not silently create manual overrides.

## 12. Mutation and Security Model

Create, update, move, resize, delete, lock, and optimizer application must pass
through authenticated server-side operations or database RPCs.

Each mutation:

1. authenticates the user;
2. verifies ownership of the business and appointment;
3. locks or version-checks affected rows;
4. reloads current schedule state;
5. evaluates hard constraints and warnings;
6. requires explicit warning confirmation when applicable;
7. commits all related changes in one transaction;
8. records actor, timestamp, operation, override, and reason;
9. returns canonical appointment data.

Requests use idempotency keys. Stale versions are rejected rather than
overwriting newer changes.

The UI may update optimistically, but it must retain a rollback snapshot. Failed
mutations restore the previous state and explain the cause.

The same ownership verification must be added to the optimizer Edge Function,
which currently receives a caller-supplied business identifier while using
service-role access.

## 13. Timezone

The business timezone is the sole calendar timezone.

It governs:

- “today”;
- selected dates;
- range boundaries;
- current-time line;
- minimum-notice calculations;
- advance windows;
- optimizer inputs;
- messages and summaries;
- daylight-saving transitions.

Device timezone must not silently change the business schedule.

## 14. Contextual Optimization

Optimization scope follows the active view:

- Day: selected day.
- Week: visible Monday–Sunday week.
- Month: visible calendar month.
- Agenda: user-selected range.

### 14.1 Month optimization

Month optimization preserves week membership by default.

- Weeks are Monday–Sunday.
- The selected month is divided into ISO-style week buckets.
- Each appointment may move only inside the intersection of its original week
  and the selected month.
- An appointment on Monday cannot move to the previous week’s Friday.
- Each week is solved independently.
- Preview is grouped by week.
- The user applies the accepted monthly result in one atomic operation.

Advanced setting:

`Allow moves between weeks`

- Off by default.
- Must be explicitly enabled.
- Must be visible in the optimization request and preview.
- When enabled, moves remain inside the selected month.
- Maximum displacement defaults to seven calendar days and is configurable from
  one to 31 days in advanced optimizer settings.

Monthly optimization uses the existing per-client and per-day move budgets
inside every weekly solve. The preview provides a week-level summary and
week filters so the result remains understandable.

### 14.2 Stale previews

Optimization runs store a schedule snapshot or version. Application fails with
a refresh action when any affected appointment changed after the preview was
generated.

Selected changes are revalidated as one set immediately before transaction
commit. Partial application is not allowed.

## 15. Query and Cache Behavior

- Introduce an appointment query-key factory.
- Keep previous range data visible during navigation.
- Prefetch adjacent day, week, or month ranges.
- Bucket appointments by business-local date.
- Optimistically update only overlapping cached ranges.
- Roll back all affected ranges on failure.
- Serialize conflicting mutations on the same appointment.

High-frequency gesture coordinates remain in refs. Drag previews are rendered
at animation-frame cadence rather than causing a full calendar rerender for
every pointer movement.

## 16. Error and Offline States

- Network error during drag or resize: rollback and explanatory toast.
- Constraint rejection: return the card to its original position and show the
  violated rule.
- Concurrent edit: reload canonical appointment and preserve the user’s proposed
  values for retry.
- Stale optimizer preview: block application and offer re-optimization.
- No optimization changes: explain whether the schedule is already compact or
  constraints prevent moves.
- Offline: previously loaded schedule remains readable; mutations are disabled
  with a clear offline message.

No offline mutation queue is included in this phase.

## 17. Accessibility

- Touch targets are at least 44 by 44 CSS pixels.
- Appointment cards are semantic interactive elements.
- Accessible names include time, client, service, and duration.
- Icon buttons have labels.
- Active view and selected date expose programmatic state.
- Calendar/Waiting List uses proper tab semantics.
- All move and resize tasks have non-gesture controls.
- Status and service are never communicated through color alone.
- Keyboard focus is visible and restored after sheets close.
- Agenda supports complete keyboard and screen-reader operation.
- Reduced-motion preferences disable nonessential transitions.
- Keyboard shortcuts ignore every editable or interactive element, not only
  text inputs.

## 18. Testing

### 18.1 Automated behavior

- Day, week, month, and agenda rendering.
- Range navigation and adjacent prefetch.
- Move across times and dates.
- Free-duration resize with each snap interval.
- Zoom limits, reset, persistence, and focal-point stability.
- Locked appointments.
- Overlaps, buffers, working hours, holidays, and service limits.
- Confirmed client-preference overrides.
- Optimistic rollback.
- Concurrent changes and idempotent retries.
- Business timezone and DST transitions.
- Month optimization with isolated weeks.
- Cross-week movement only when enabled.
- Stale and atomic optimizer application.

### 18.2 Device matrix

- Small and large iPhones.
- Safari browser and installed PWA.
- Pixel/Chrome.
- iPad portrait and landscape.
- Phone landscape three-day view.
- Tablet landscape week view.
- Keyboard-only and screen-reader use.
- 200% browser zoom.
- Reduced-motion setting.

### 18.3 Deployment regression

- Production Next.js build passes.
- Solver tests remain green.
- Manifest and icon URLs resolve.
- Every existing landing image URL resolves.
- Standalone output contains copied `public/` assets.
- No existing path under `public/` or `.emergent/` changes.

## 19. Acceptance Criteria

- Phone Day view fits the viewport without horizontal scrolling.
- Vertical scrolling never causes accidental appointment movement.
- Every appointment action is possible without gestures.
- Drag and resize provide immediate target time and duration feedback.
- Duration resize does not change the service default.
- No mutation can violate hard constraints.
- Confirmable warnings require explicit approval and are audited.
- Locked appointments cannot move.
- All schedule writes are authenticated, tenant-scoped, version-checked,
  idempotent, and transactional.
- Undo is server-validated.
- Calendar behavior follows the business timezone across DST.
- Navigation retains visible data while new ranges load.
- Month remains fluid with dense schedules.
- Month optimization preserves week membership by default.
- Cross-week movement is disabled unless explicitly enabled.
- Desktop calendar retains its current functionality.
- Existing image paths and Emergent-required directories remain unchanged.

## 20. Recommended Delivery Sequence

1. Add timezone/date utilities, query-key factories, and calendar configuration.
2. Add authenticated transactional calendar mutation endpoints.
3. Extract the existing desktop calendar renderer.
4. Introduce the shared controller without changing desktop visuals.
5. Build mobile Day and appointment quick sheet.
6. Add explicit Move, validated drag, and free-duration resize.
7. Add vertical zoom.
8. Add Week overview and responsive multi-day views.
9. Add Month and Agenda.
10. Add contextual and week-isolated monthly optimization.
11. Complete accessibility, device, concurrency, and deployment regression tests.
12. Capture final mobile screenshots and design the landing-page app section.
