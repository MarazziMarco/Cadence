import { describe, expect, it } from "vitest";
import { parseAppointment, type PatientLite, type ServiceLite } from "@/lib/voice/parse-appointment";

const PATIENTS: PatientLite[] = [
  { id: "p1", first_name: "Marco", last_name: "Rossi", full_name: "Marco Rossi", address: null },
  { id: "p2", first_name: "Marco", last_name: "Bianchi", full_name: "Marco Bianchi", address: null },
  { id: "p3", first_name: "Anaïs", last_name: "Néri", full_name: "Anaïs Néri", address: null },
  { id: "p4", first_name: "Jean-Luc", last_name: "Picard", full_name: "Jean-Luc Picard", address: null },
  { id: "p5", first_name: "Giulia", last_name: "Verdi", full_name: "Giulia Verdi", address: "Via Roma 1" },
];
const SERVICES: ServiceLite[] = [
  { id: "s1", name: "fisioterapia", duration_minutes: 45 },
  { id: "s2", name: "massaggio", duration_minutes: 60 },
];
// Wednesday 2026-07-15
const TODAY = new Date(2026, 6, 15);

function parse(text: string) {
  return parseAppointment(text, PATIENTS, SERVICES, TODAY);
}

describe("parseAppointment — patient resolution", () => {
  it("resolves an exact full name (IT) to existing", () => {
    const r = parse("Marco Rossi domani alle 15 fisioterapia");
    expect(r.patient).toEqual({ kind: "existing", id: "p1", displayName: "Marco Rossi", storedAddress: null });
    expect(r.time).toBe("15:00");
    expect(r.serviceId).toBe("s1");
    expect(r.durationMinutes).toBe(45);
    expect(r.date).toBe("2026-07-16");
  });

  it("resolves an existing name (EN) and surfaces the stored address", () => {
    const r = parse("book Giulia Verdi tomorrow at 3pm");
    expect(r.patient).toEqual({ kind: "existing", id: "p5", displayName: "Giulia Verdi", storedAddress: "Via Roma 1" });
    expect(r.time).toBe("15:00");
  });

  it("proposes a new client when nobody matches (IT)", () => {
    const r = parse("nuovo cliente Paolo Gialli venerdì");
    expect(r.patient).toEqual({ kind: "new", proposedName: "Paolo Gialli" });
  });

  it("proposes a new client (EN)", () => {
    const r = parse("schedule John Doe on friday");
    expect(r.patient).toEqual({ kind: "new", proposedName: "John Doe" });
  });

  it("keeps Italian greetings and morning qualifiers out of a new client name", () => {
    const r = parse("Ciao Francesco domani alle 10 di mattina");

    expect(r.patient).toEqual({ kind: "new", proposedName: "Francesco" });
    expect(r.date).toBe("2026-07-16");
    expect(r.time).toBe("10:00");
  });

  it("flags duplicate first names as ambiguous", () => {
    const r = parse("Marco domani");
    expect(r.patient.kind).toBe("ambiguous");
    if (r.patient.kind === "ambiguous") {
      expect(r.patient.proposedName).toBe("Marco");
      expect(r.patient.candidateIds.sort()).toEqual(["p1", "p2"]);
    }
  });

  it("matches accented names", () => {
    const r = parse("Anaïs domani");
    expect(r.patient).toMatchObject({ kind: "existing", id: "p3" });
  });

  it("matches hyphenated names", () => {
    const r = parse("Jean-Luc domani");
    expect(r.patient).toMatchObject({ kind: "existing", id: "p4" });
  });

  it("returns none when there is no name", () => {
    const r = parse("domani alle 10");
    expect(r.patient).toEqual({ kind: "none" });
  });
});

describe("parseAppointment — time and `alle 15`", () => {
  it("parses bare `alle 15`", () => {
    const r = parse("Marco Rossi alle 15");
    expect(r.time).toBe("15:00");
  });
});

describe("parseAppointment — addresses", () => {
  it("reads an appointment-anchored address", () => {
    const r = parse("Giulia Verdi domani appuntamento in via Milano 5");
    expect(r.appointmentAddress).toBe("via Milano 5");
    expect(r.clientAddress).toBeNull();
  });

  it("reads a client-anchored address", () => {
    const r = parse("Marco Rossi abita in via Napoli 3 domani");
    expect(r.clientAddress).toBe("via Napoli 3");
    expect(r.appointmentAddress).toBeNull();
    expect(r.patient).toMatchObject({ kind: "existing", id: "p1" });
  });

  it("reads a combined client + appointment address", () => {
    const r = parse("Marco Rossi abita in via Napoli 3 appuntamento in via Milano 5");
    expect(r.clientAddress).toBe("via Napoli 3");
    expect(r.appointmentAddress).toBe("via Milano 5");
  });

  it("treats a bare street as the appointment location", () => {
    const r = parse("Marco Rossi domani via Torino 7");
    expect(r.appointmentAddress).toBe("via Torino 7");
  });
});

describe("parseAppointment — availability", () => {
  it("solo replaces the week with the listed days", () => {
    const r = parse("Giulia Verdi disponibile solo il lunedì e mercoledì");
    expect(r.availability).toEqual({ mode: "replace", days: { monday: "all_day", wednesday: "all_day" } });
    expect(r.patient).toMatchObject({ kind: "existing", id: "p5" });
  });

  it("hard negation marks a day unavailable (merge)", () => {
    const r = parse("Marco Rossi non può il martedì");
    expect(r.availability).toEqual({ mode: "merge", days: { tuesday: "unavailable" } });
  });

  it("soft morning preference with no day applies to the whole week (merge)", () => {
    const r = parse("Giulia Verdi preferisce la mattina");
    expect(r.availability?.mode).toBe("merge");
    expect(r.availability?.days.monday).toBe("prefer_morning");
    expect(r.availability?.days.sunday).toBe("prefer_morning");
  });

  it("soft preference scoped to a day", () => {
    const r = parse("Marco Rossi preferisce la mattina il lunedì");
    expect(r.availability).toEqual({ mode: "merge", days: { monday: "prefer_morning" } });
  });

  it("does not treat the appointment weekday as availability", () => {
    const r = parse("Marco Rossi venerdì alle 10");
    expect(r.availability).toBeNull();
    expect(r.date).toBe("2026-07-17");
    expect(r.time).toBe("10:00");
  });
});
