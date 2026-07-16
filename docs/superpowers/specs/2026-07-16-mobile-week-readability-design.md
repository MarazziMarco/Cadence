# Cadence Mobile Week Readability and Gestures

Date: 2026-07-16

Status: approved design

Scope: phone `grid` week only

## 1. Purpose

Make the phone week view readable and fully interactive without changing the
approved seven-to-three-day header zoom or the optional timeline layout.

The current implementation reuses the full appointment card inside columns that
can be approximately 49 pixels wide. Its padding, status, service line, and
resize target consume more width than the column provides. It also lacks the
vertical pinch/scroll architecture used by the phone Day view, and its gesture
code cannot resolve a destination day from horizontal movement.

## 2. Confirmed Product Decisions

- The default phone week remains a vertical time grid.
- Pinching the day header continues to change horizontal density from seven to
  three visible days.
- Pinching the time-grid body changes vertical hour density exactly as in Day.
- Hour density remains the existing calendar density preference and persists
  using the existing local setting.
- Appointment cards always show start time and client name, even at seven days.
- Service name appears only when width and height permit.
- Status and duration are omitted from the narrow weekly card.
- Appointments can be dragged vertically to another time and horizontally to
  another day.
- At seven visible days, resize is available through the quick sheet instead of
  a large inline resize target.
- When a real collision cluster cannot remain readable, the view shows the
  first readable card plus `+N`. At wider three-to-five-day zoom levels,
  appointments may render in separate lanes.

## 3. Architecture

### 3.1 Weekly viewport

`MobileWeekTimeGrid` owns one viewport that scrolls both vertically and
horizontally. The sticky day header remains aligned with the body columns.

The body attaches the existing vertical `usePinchZoom` behavior. The header
alone attaches `useWeekHeaderPinch`. A gesture lock prevents:

- appointment drag during vertical pinch;
- vertical pinch during appointment drag;
- header pinch from starting in the body;
- ordinary one-finger scrolling from being captured.

The scroll reference passed to appointment gestures must be the vertically
scrollable viewport, not a horizontal-only wrapper.

### 3.2 Compact weekly appointment

Add a dedicated weekly presentation to `AppointmentCard` or a focused
`MobileWeekAppointmentCard`.

Narrow hierarchy:

1. start time;
2. client name;
3. service only when layout measurements allow it.

The card uses smaller padding and type while preserving a minimum selectable
target through the complete card surface. Inline resizing is hidden in the
seven-day presentation so it does not intercept long-press dragging.

Overlap lanes must be calculated from real appointment time footprints.
Minimum visual height must not create false temporal overlap. Visual collision
handling is a rendering concern applied after temporal lane calculation.

### 3.3 Cross-day dragging

Extend the weekly gesture adapter to translate:

- `clientY` into a snapped start minute;
- `clientX` into the target day column;
- horizontal edge proximity into horizontal auto-scroll;
- vertical edge proximity into vertical auto-scroll.

The preview follows both target date and time. The final intent uses the
existing validated calendar move mutation with the new date and start time.

Dragging never bypasses working hours, overlap, lock, or version validation.

### 3.4 Collision clusters

At narrow widths, if separate lanes fall below the readable width threshold:

- render one representative appointment;
- render a `+N` indicator inside the same time region;
- tapping the cluster opens a compact list of the simultaneous appointments;
- selecting one opens the existing quick sheet.

At wider zoom, normal lane rendering returns automatically.

## 4. User Experience

- Opening Week shows seven days and the selected day in view.
- The body initially scrolls near the current time or first appointment,
  matching Day behavior.
- Vertical zoom keeps the touched time under the pinch focal point.
- Horizontal header zoom keeps the selected day visible.
- Long press begins a drag; ordinary taps open the quick sheet.
- A drag across a column boundary previews the new day immediately.
- The floating zoom controls remain positioned relative to the calendar
  viewport and operate in Day and Week consistently.

## 5. Accessibility

- Every card retains a complete accessible name with time, client, service,
  duration, and status even when visual text is hidden.
- Cluster indicators expose the number and accessible names of hidden
  appointments.
- Keyboard users can continue to open the quick sheet and use its explicit
  Move and Resize actions.
- Reduced-motion preferences disable animated drag/scroll transitions.

## 6. Testing

Required automated coverage:

- seven-day cards render visible time and client text;
- service visibility changes at the width threshold;
- temporal lane allocation is not affected by minimum visual height;
- body pinch updates density and preserves focal scroll position;
- header pinch changes only day width;
- gesture locks prevent pinch/drag conflicts;
- a long press can move within a day and across a day boundary;
- horizontal and vertical edge auto-scroll;
- collision cluster `+N` behavior;
- phone-width integration test with no document overflow.

## 7. Out of Scope

- Changes to the optional phone timeline layout.
- Route optimization or address display.
- Redesign of Day, tablet, or desktop calendar views.

