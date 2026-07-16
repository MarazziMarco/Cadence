# Cadence Week and Desktop Month Calendar

Date: 2026-07-16

Status: approved design

Scope: phone week layouts, continuous week zoom, and desktop month/agenda views

## 1. Purpose

Make Cadence's calendar views coherent across phone, tablet, and desktop while
keeping the interaction model close to the Google Calendar application.

The redesign must:

- replace the phone week summary list with a real time-grid week;
- make weekly optimization changes visually obvious before and after applying;
- offer an optional phone-only horizontal timeline week;
- support a continuous, temporary pinch from seven to three visible days;
- add Month and Agenda to the desktop view selector;
- render a full-width desktop month with appointments inside day cells;
- preserve existing appointment, constraint, and optimizer behavior.

This work does not add Google Calendar synchronization.

## 2. Confirmed Product Decisions

### 2.1 Phone week default

The default phone week is a seven-column time grid. It shows Monday through
Sunday simultaneously and uses the same vertical time model as Day and the
desktop week.

This layout is named `grid`.

### 2.2 Optional phone week

The existing summary list is replaced by an optional horizontal timeline with
one row per day. Each row maps working time left-to-right and renders
appointments as positioned blocks.

This layout is named `timeline`.

It is available only on phone. Tablet and desktop always use a vertical
time-grid layout.

### 2.3 Preference storage

The phone week layout preference is stored only in the current device's
`localStorage`.

- Default: `grid`.
- Alternative: `timeline`.
- It is not stored in Supabase.
- It does not synchronize between devices.
- Invalid or missing stored values fall back to `grid`.

### 2.4 Continuous week pinch

Pinching horizontally on the week day-header changes the visible day count
continuously from seven down to three.

- Pinch-out enlarges columns and moves toward three visible days.
- Pinch-in shrinks columns and moves toward seven visible days.
- The body columns remain aligned with the header throughout the gesture.
- When fewer than seven days fit, the week scrolls horizontally.
- The selected day remains visible. When horizontal overflow begins, the
  scroll position centers it unless the week boundary prevents centering.
- The gesture starts only on the day-header, preventing conflict with vertical
  calendar zoom, appointment drag, resize, or page scrolling.
- Week pinch state is not persisted.
- Entering Week starts at seven visible days.
- Leaving Week, switching to `timeline`, or remounting resets it to seven.

The effective visible-day value is fractional during the gesture. Layout
width is derived continuously from that value rather than switching at fixed
breakpoints.

### 2.5 Desktop month

Desktop adds a full-width Month view inspired by Google Calendar.

- Seven columns, Monday through Sunday.
- Five or six rows depending on the month.
- Appointments render directly inside each day cell with time, client, and
  service where space permits.
- Overflow is summarized with a localized “more” count.
- Clicking an appointment opens the existing appointment quick sheet.
- Clicking a day selects it.
- Selecting the already-selected day again enters Day view.
- Today and the selected day remain visually distinct.
- Adjacent-month days remain visible with muted styling.

### 2.6 Desktop view selector

Desktop exposes:

- Day;
- Week;
- Month;
- Agenda.

Agenda reuses the existing agenda data and appointment-selection flow in a
desktop-width presentation.

## 3. Architecture

### 3.1 Shared time-grid foundation

Extract the reusable time-grid calculations and rendering contracts currently
spread across `DesktopWeekCalendar` and `TabletMultiDayCalendar`.

The shared foundation owns:

- visible date generation;
- time-range calculation;
- hour and slot geometry;
- appointment overlap lanes;
- aligned header and body column widths;
- blank-slot creation;
- appointment selection;
- validated move and resize intents;
- horizontal scroll positioning.

Desktop, tablet, and phone provide presentation parameters instead of
duplicating scheduling logic.

The phone grid must retain touch-safe appointment interactions through the
existing `AppointmentCard` gesture path.

### 3.2 Phone week components

Replace `MobileWeekOverview` with two focused renderers:

- `MobileWeekTimeGrid` for the default seven-to-three-day vertical grid;
- `MobileWeekTimeline` for the optional one-row-per-day layout.

`CalendarController` chooses between them from the local phone preference.

The existing Preferences screen gains a Calendar section containing the phone
week layout selector. It shows `Week grid` and `Daily timelines`, explains that
the choice applies only to this phone, and writes the device-local preference.
The phone week toolbar does not gain another settings control.

### 3.3 Continuous header zoom

Create a dedicated week-header pinch hook rather than extending vertical
calendar zoom.

The hook receives:

- current visible-day value;
- header and horizontal-scroll references;
- selected date index;
- minimum three and maximum seven;
- change and reset callbacks.

It handles two-pointer distance, clamps the continuous value, keeps header/body
width synchronized, and preserves the selected-day scroll anchor.

It must use Pointer Events when available and avoid disabling ordinary
single-finger horizontal scrolling.

### 3.4 Desktop month renderer

Create `DesktopMonthCalendar` using the existing month-cell builder as the
source of date membership, today state, selection state, and appointment
buckets.

The mobile month and desktop month share month data helpers but remain separate
renderers because their density and detail hierarchy differ substantially.

The desktop renderer reuses:

- appointment color resolution;
- localized date formatting;
- `AppointmentQuickSheet`;
- controller navigation;
- contextual month optimization.

### 3.5 Desktop agenda

Adapt `CalendarAgenda` to accept a desktop presentation mode or wrap its shared
agenda sections in a desktop shell. Do not duplicate agenda querying or
pagination logic.

## 4. User Experience

### 4.1 Phone grid week

The week opens with all seven days visible. The layout prioritizes:

- stable day headers;
- visible time gaps;
- color continuity with Day;
- immediate visual feedback after optimization;
- readable appointment identity at the current zoom level.

At seven days, cards show start time and truncated client name. Below five
visible days, responsive CSS also shows the service when the card height
permits, without changing the underlying appointment card.

Horizontal scrolling appears progressively as the user zooms toward three
days. No mode label or modal is shown during pinch; the response should feel
direct.

### 4.2 Phone timeline week

The alternative timeline shows seven stacked day rows.

- The left side contains weekday and date.
- The right side maps the day's working windows horizontally.
- Appointments are positioned by time and duration.
- Closures and lunch breaks are visually distinct.
- Tapping an appointment opens the quick sheet.
- Tapping empty time enters Day on that date, focused near the tapped time.
- Drag and resize are not required in this compact alternative; explicit Move
  remains available through the quick sheet.

The Optimize action still targets the full Monday–Sunday range.

### 4.3 Optimization

Week optimization scope is always the full week, independent of:

- phone week layout;
- continuous visible-day zoom;
- horizontal scroll position;
- selected day within the week.

The preview remains unchanged. After applying, all visible calendar queries are
invalidated and the current renderer updates in place so closed gaps are
immediately visible.

Month optimization continues to use the existing contextual month behavior.

### 4.4 Navigation

- Week previous/next moves by seven days.
- Month previous/next moves by calendar month.
- Today selects the business-local current date.
- Phone Week always initializes its horizontal position so the selected day is
  visible.
- Switching between views preserves the selected date.

## 5. Accessibility and Input

- Day headers are real buttons with full localized date labels.
- The selected day uses `aria-current="date"` or an equivalent semantic state.
- The week layout selector is keyboard and screen-reader accessible.
- Appointment blocks keep unique accessible names.
- Pinch is an enhancement: every view and navigation action remains available
  without multi-touch.
- Desktop Month supports keyboard focus for day cells and appointments.
- Reduced-motion preferences remove nonessential zoom/scroll animation.
- Touch targets remain at least 44 CSS pixels where the layout permits; compact
  week cards preserve a larger invisible interaction target when necessary.

## 6. State and Persistence

Persist only:

- active calendar view through the existing view key;
- phone week layout through a new device-local key;
- vertical time density through the existing density key.

Do not persist:

- continuous week visible-day zoom;
- horizontal week scroll offset;
- selected month cell beyond the existing selected date;
- temporary optimizer or quick-sheet state.

Storage key:

```text
cadence.calendar.phoneWeekLayout
```

Allowed values:

```text
grid | timeline
```

## 7. Data and Backend

No database migration is required.

No change is required to:

- appointment mutation RPCs;
- optimization snapshot tables;
- optimizer Edge Function inputs;
- month/week contextual optimization ranges.

The existing authenticated and atomic mutation paths remain mandatory for all
create, move, resize, apply, and undo operations.

## 8. Error Handling

- Invalid local preferences silently fall back to `grid`.
- Unsupported or interrupted pinch gestures restore the last valid clamped
  width.
- If appointment data refresh fails, retain the previous visible range and
  expose the existing query error behavior.
- If optimization apply fails, keep the preview open and do not partially
  change the calendar.
- Empty and closed days render explicitly rather than collapsing columns or
  rows.

## 9. Performance

- Memoize month cells, visible week dates, appointment buckets, and lane
  allocation.
- Do not rerun data queries while pinch changes column width.
- Use transforms or CSS width variables during the active gesture to avoid
  rebuilding appointment data.
- Avoid rendering desktop-level appointment detail in compact seven-day phone
  columns.
- Preserve adjacent-range prefetching already owned by `CalendarController`.

## 10. Testing

### Unit and component tests

- phone week preference parsing and fallback;
- phone grid defaults to seven visible days;
- continuous pinch clamps between three and seven;
- leaving Week resets zoom to seven;
- header and body share the same computed column width;
- selected day remains visible during zoom;
- timeline positions appointments against working windows;
- timeline empty-time tap enters Day;
- desktop view selector exposes all four views;
- desktop month renders five- and six-row months;
- desktop month appointment click opens the shared selection flow;
- repeated selected-day click enters Day;
- optimizer scope remains the full week at every zoom/layout.

### Regression verification

- complete Vitest suite;
- solver suite;
- production build;
- Playwright phone coverage for both week layouts and pinch;
- Playwright desktop coverage for Month and Agenda;
- overflow checks in phone portrait and landscape;
- keyboard and reduced-motion checks.

## 11. Acceptance Criteria

The work is complete when:

1. Phone Week defaults to a seven-day vertical time grid.
2. Pinching only the day-header changes smoothly from seven to three visible
   days and is never persisted.
3. The phone-only timeline layout can be selected locally and survives reloads
   on that device.
4. Tablet and desktop always retain a vertical time grid for Week.
5. Desktop offers Day, Week, Month, and Agenda.
6. Desktop Month uses the full calendar width and renders appointments inside
   cells.
7. Week and month optimization ranges remain correct and their applied changes
   are immediately visible.
8. Existing create, edit, move, resize, quick-sheet, and constraint behavior
   remains intact.
9. Tests, solver verification, and production build pass.

## 12. Deferred

- Google Calendar synchronization.
- Persisting week zoom between visits.
- Account-synchronized phone week preferences.
- Timeline drag and resize.
- Native mobile application behavior outside the PWA.
