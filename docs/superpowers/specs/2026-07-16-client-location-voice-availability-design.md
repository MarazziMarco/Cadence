# Cadence Client Location, Voice, and Availability

Date: 2026-07-16

Status: approved design

Scope: client and appointment addresses, voice parsing, new-client creation,
and recurring client availability

## 1. Purpose

Create one reliable client/location model shared by manual appointment entry,
voice entry, and the routing-aware scheduler.

Addresses remain optional. When automatic resolution finds no appointment or
client address, the appointment is treated as being in the studio.

## 2. Location Model

### 2.1 Studio

The existing optional business address becomes the studio address exposed in
Settings. It includes address, city, and postal code.

The user may instead grant one-time device-location permission. Cadence stores
only approximate coordinates, accuracy, source, and capture time. It does not
track the device continuously.

### 2.2 Client

The existing optional patient address, city, and postal code become editable in
the client form and visible in the profile.

### 2.3 Appointment

Appointments gain:

- `location_mode`: `inherit`, `studio`, `patient`, or `custom`;
- optional custom address, city, and postal code;
- geocoding status, normalized address hash, latitude, longitude, and
  geocoded timestamp for a custom location.

Resolution rules:

1. `studio` uses the studio location;
2. `patient` uses the current client location and is unavailable as a choice
   until the client has an address or coordinates;
3. `custom` uses the appointment location and requires a non-empty address;
4. `inherit` uses appointment custom data when present, then the client
   location, then the studio.

If `inherit` has no address at any level, it is still a studio appointment and
has zero travel to other studio appointments.

## 3. Voice Parser

### 3.1 Patient resolution

The parser returns one of:

- existing client;
- proposed new client;
- ambiguous match with selectable candidates;
- no detected client.

Exact normalized full-name matches win. A first-name or last-name match is
accepted only when unique. The parser never silently selects the first of
multiple matching clients.

When no client matches, the parser extracts a proposed name from explicit
anchors or the leading appointment phrase. The name appears as an editable
`Nuovo cliente` proposal. No database row is created before final
confirmation.

### 3.2 Address language

An unqualified appointment phrase such as “Marco domani alle 15 in via Roma
10” sets the appointment-specific address.

Explicit client phrases such as “Marco abita in via Roma 10” or “indirizzo
cliente via Roma 10” set the persistent client address.

If both are spoken, the parser keeps them separately. For an existing client,
changing a stored address requires visible confirmation. It is never
overwritten silently.

### 3.3 Safe creation

Voice parsing is preview-only. The user can edit:

- selected or proposed client;
- client address;
- appointment address and location mode;
- date, time, service, and duration;
- recurring availability.

Client creation and appointment creation must be atomic or compensating:
cancelled warnings and failed appointments cannot leave an orphan client.

## 4. Per-Day Client Availability

Each weekday has one visible state:

- unavailable;
- available all day;
- morning only;
- afternoon only;
- prefers morning;
- prefers afternoon.

Hard constraints:

- unavailable;
- available all day;
- morning only;
- afternoon only.

Soft preferences:

- prefers morning;
- prefers afternoon.

Morning and afternoon use that weekday's configured business windows. If the
required window is missing, use 09:00–13:00 for morning and 14:00–18:00 for
afternoon.

### 4.1 Storage

Reuse `patient_availability` and add an explicit `is_available` flag so an
unavailable recurring weekday is not encoded through missing data.

- unavailable: `is_available=false`;
- all day: one normal full-day row;
- morning only: one normal morning row;
- afternoon only: one normal afternoon row;
- prefers morning: normal full-day plus high-priority morning row;
- prefers afternoon: normal full-day plus high-priority afternoon row.

No rows for a client means legacy/default flexibility. A missing weekday is
also flexible unless an explicit unavailable row exists. The phrase `solo` or
`only` writes explicit unavailable states for every unmentioned weekday.

Normal rows define hard feasibility. High-priority rows are soft preference
windows and never expand the normal allowed windows.

### 4.2 Voice language

The parser distinguishes:

- merge language: “lunedì mattina, giovedì pomeriggio, mai venerdì” changes
  only those days;
- replace language: “solo lunedì mattina e giovedì pomeriggio” marks every
  unmentioned day unavailable;
- hard cues: available, only, cannot, never;
- soft cues: prefers, preferably, better in the morning/afternoon.

All parsed states are shown in the seven-day editor before saving.

## 5. Data and API Changes

- Expose existing business and patient address columns in TypeScript types,
  queries, forms, and profiles.
- Add appointment location columns through a migration.
- Add the location fields to calendar mutation validation, allowlists, insert,
  update, returned data, audit snapshots, and appointment queries.
- Add patient availability read/write helpers that support per-day merge and
  replace operations.
- Update manual appointment, voice appointment, and demo consumers to the new
  parser contract.
- Invalidate stored geocodes when normalized address hashes change.

## 6. Error Handling

- An invalid custom address remains editable and is marked unresolved.
- Explicit `patient` mode without a client location cannot be saved.
- An ambiguous voice name disables creation until resolved.
- Address service failures do not discard entered text.
- Availability writes are transactional: the old weekly schedule remains if
  the replacement fails.

## 7. Testing

Required coverage:

- existing, new, ambiguous, accented, apostrophe, and hyphenated names;
- phrases without names do not create clients named after dates or services;
- patient-only, appointment-only, and combined addresses;
- `alle 15` is parsed as time, not as an address;
- existing-address overwrite confirmation;
- no orphan client after appointment failure or cancelled warning;
- all six weekday states and business-window fallbacks;
- merge versus `solo`/replace voice semantics;
- hard availability rejects invalid optimizer placements;
- high-priority availability affects cost but not feasibility;
- appointment mutation accepts, persists, and returns location fields.

## 8. Privacy

Addresses and coordinates are tenant-scoped personal data. They must not appear
in application logs, optimizer explanations, analytics events, or public cache
keys.

