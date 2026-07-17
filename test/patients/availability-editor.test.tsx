import { fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { WorkingHour } from "@/lib/types/db";
import {
  availabilityRowsForWeekly,
  createDefaultWeeklyAvailability,
  getPatientWeeklyAvailability,
  mergePatientWeeklyAvailability,
  replacePatientWeeklyAvailability,
  setPatientWeekdayAvailability,
  weeklyAvailabilityFromRows,
  type WeeklyAvailability,
} from "@/lib/api/patients";
import { PatientAvailabilityEditor } from "@/components/patients/patient-availability-editor";

const supabase = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => supabase,
}));

const workingHours: WorkingHour[] = [
  {
    id: "wh-monday",
    business_id: "business-1",
    weekday: "monday",
    is_open: true,
    morning_start: "08:15:00",
    morning_end: "12:30:00",
    afternoon_start: "14:15:00",
    afternoon_end: "19:00:00",
  },
];

const weekly: WeeklyAvailability = {
  monday: "unavailable",
  tuesday: "all_day",
  wednesday: "morning_only",
  thursday: "afternoon_only",
  friday: "prefer_morning",
  saturday: "prefer_afternoon",
  sunday: "all_day",
};

describe("PatientAvailabilityEditor", () => {
  it("renders every weekday with all six states and emits an immutable update", () => {
    const onChange = vi.fn();
    const initial = createDefaultWeeklyAvailability();

    render(
      <PatientAvailabilityEditor
        value={initial}
        onChange={onChange}
      />,
    );

    const selects = screen.getAllByRole("combobox");
    expect(selects).toHaveLength(7);
    expect(selects[0].querySelectorAll("option")).toHaveLength(6);

    fireEvent.change(screen.getByLabelText(/monday/i), {
      target: { value: "prefer_morning" },
    });

    expect(onChange).toHaveBeenCalledWith({
      ...initial,
      monday: "prefer_morning",
    });
    expect(initial.monday).toBe("all_day");
  });
});

describe("weekly availability mapping", () => {
  it("writes every state explicitly using weekday business windows and fallbacks", () => {
    const rows = availabilityRowsForWeekly("patient-1", weekly, workingHours);
    const byDay = rows.reduce<Record<string, typeof rows>>((grouped, row) => {
      grouped[row.weekday] ??= [];
      grouped[row.weekday].push(row);
      return grouped;
    }, {});

    expect(byDay.monday).toEqual([
      expect.objectContaining({
        start_time: "00:00:00",
        end_time: "24:00:00",
        priority: "normal",
        is_available: false,
      }),
    ]);
    expect(byDay.tuesday).toEqual([
      expect.objectContaining({
        start_time: "00:00:00",
        end_time: "24:00:00",
        priority: "normal",
        is_available: true,
      }),
    ]);
    expect(byDay.wednesday).toEqual([
      expect.objectContaining({
        start_time: "09:00:00",
        end_time: "13:00:00",
        priority: "normal",
      }),
    ]);
    expect(byDay.thursday).toEqual([
      expect.objectContaining({
        start_time: "14:00:00",
        end_time: "18:00:00",
        priority: "normal",
      }),
    ]);
    expect(byDay.friday).toEqual([
      expect.objectContaining({
        priority: "normal",
        start_time: "00:00:00",
        end_time: "24:00:00",
      }),
      expect.objectContaining({ priority: "high", start_time: "09:00:00" }),
    ]);
    expect(byDay.saturday).toEqual([
      expect.objectContaining({
        priority: "normal",
        start_time: "00:00:00",
        end_time: "24:00:00",
      }),
      expect.objectContaining({ priority: "high", start_time: "14:00:00" }),
    ]);
    expect(byDay.sunday).toHaveLength(1);
  });

  it("uses configured windows for partial states on the matching weekday", () => {
    const partial = createDefaultWeeklyAvailability();
    partial.monday = "prefer_morning";
    const rows = availabilityRowsForWeekly("patient-1", partial, workingHours);
    const monday = rows.filter((row) => row.weekday === "monday");

    expect(monday.map(({ start_time, end_time }) => [start_time, end_time]))
      .toEqual([
        ["00:00:00", "24:00:00"],
        ["08:15:00", "12:30:00"],
      ]);
  });

  it("decodes explicit rows and keeps missing legacy weekdays flexible", () => {
    const rows = availabilityRowsForWeekly("patient-1", weekly, workingHours)
      .filter((row) => row.weekday !== "sunday");

    expect(weeklyAvailabilityFromRows(rows, workingHours)).toEqual(weekly);
  });

  it("does not let a high row outside normal hard windows change the decoded state", () => {
    const decoded = weeklyAvailabilityFromRows([
      {
        patient_id: "patient-1",
        weekday: "monday",
        start_time: "08:15:00",
        end_time: "12:30:00",
        priority: "normal",
        is_available: true,
        recurring: true,
        valid_from: null,
        valid_until: null,
      },
      {
        patient_id: "patient-1",
        weekday: "monday",
        start_time: "14:15:00",
        end_time: "19:00:00",
        priority: "high",
        is_available: true,
        recurring: true,
        valid_from: null,
        valid_until: null,
      },
    ], workingHours);

    expect(decoded.monday).toBe("morning_only");
  });
});

function queryResult(
  result: { data?: unknown; error?: unknown } = { data: null, error: null },
) {
  const query: Record<string, any> = {};
  for (const method of ["select", "eq", "is", "update", "insert"]) {
    query[method] = vi.fn(() => query);
  }
  query.then = (
    resolveResult: (value: { data?: unknown; error?: unknown }) => unknown,
  ) => Promise.resolve(result).then(resolveResult);
  return query;
}

describe("weekly availability persistence helpers", () => {
  it("loads recurring rows and decodes missing weekdays as flexible", async () => {
    const query = queryResult({
      data: availabilityRowsForWeekly("patient-1", weekly, workingHours)
        .filter((row) => row.weekday === "monday"),
      error: null,
    });
    supabase.from.mockReturnValueOnce(query);

    const loaded = await getPatientWeeklyAvailability(
      "patient-1",
      workingHours,
    );

    expect(supabase.from).toHaveBeenCalledWith("patient_availability");
    expect(query.eq).toHaveBeenCalledWith("recurring", true);
    expect(loaded.monday).toBe("unavailable");
    expect(loaded.tuesday).toBe("all_day");
  });

  it("replaces all recurring rows through one transactional RPC", async () => {
    supabase.rpc.mockResolvedValueOnce({ data: null, error: null });

    await replacePatientWeeklyAvailability(
      "patient-1",
      weekly,
      workingHours,
    );

    expect(supabase.rpc).toHaveBeenCalledWith(
      "replace_patient_weekly_availability",
      {
        p_patient_id: "patient-1",
        p_rows: expect.arrayContaining([
          expect.objectContaining({
            weekday: "monday",
            is_available: false,
          }),
          expect.objectContaining({
            weekday: "friday",
            priority: "high",
          }),
        ]),
      },
    );
  });

  it("surfaces a transactional RPC failure without issuing client-side writes", async () => {
    supabase.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "invalid replacement" },
    });

    await expect(replacePatientWeeklyAvailability(
      "patient-1",
      weekly,
      workingHours,
    )).rejects.toEqual({ message: "invalid replacement" });

    expect(supabase.from).not.toHaveBeenCalled();
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });

  it("clears legacy recurring constraints through the same transaction", async () => {
    supabase.rpc.mockResolvedValueOnce({ data: null, error: null });

    await setPatientWeekdayAvailability("patient-1", []);

    expect(supabase.rpc).toHaveBeenCalledWith(
      "replace_patient_weekly_availability",
      { p_patient_id: "patient-1", p_rows: [] },
    );
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("decodes full-day normal plus nested high rows as preferences", () => {
    const rows = availabilityRowsForWeekly("patient-1", weekly, workingHours);
    const preferenceRows = rows.filter((row) => (
      row.weekday === "friday" || row.weekday === "saturday"
    ));

    expect(weeklyAvailabilityFromRows(preferenceRows, workingHours).friday)
      .toBe("prefer_morning");
    expect(weeklyAvailabilityFromRows(preferenceRows, workingHours).saturday)
      .toBe("prefer_afternoon");
  });

  it("merges a patch without changing other weekday states", async () => {
    const existing = availabilityRowsForWeekly(
      "patient-1",
      weekly,
      workingHours,
    );
    const selectQuery = queryResult({ data: existing, error: null });
    supabase.rpc.mockResolvedValueOnce({ data: null, error: null });
    supabase.from
      .mockReturnValueOnce(selectQuery);

    await mergePatientWeeklyAvailability(
      "patient-1",
      { monday: "morning_only" },
      workingHours,
    );

    const inserted = supabase.rpc.mock.calls[0][1].p_rows;
    const decoded = weeklyAvailabilityFromRows(inserted, workingHours);
    expect(decoded.monday).toBe("morning_only");
    expect(decoded.friday).toBe("prefer_morning");
    expect(decoded.saturday).toBe("prefer_afternoon");
  });
});

describe("manual appointment availability semantics", () => {
  it("keeps hard normal windows separate from high soft preferences", () => {
    const migration = readFileSync(resolve(
      process.cwd(),
      "supabase/migrations/202607160006_client_availability.sql",
    ), "utf8");

    expect(migration).toContain("availability.is_available = false");
    expect(migration).toContain("availability.priority::text = 'normal'");
    expect(migration).toContain("availability.priority::text = 'high'");
    expect(migration).toContain(
      "This time is outside the patient preferred window.",
    );
    expect(migration).toMatch(/security definer/i);
    expect(migration).toMatch(/from public\.patients[\s\S]+from public\.business[\s\S]+profile_id = auth\.uid\(\)/i);
    expect(migration).toMatch(/jsonb_array_elements\(p_rows\)/i);
    expect(migration).toMatch(/update public\.patient_availability[\s\S]+set deleted_at = clock_timestamp\(\)[\s\S]+insert into public\.patient_availability/i);
    expect(migration.indexOf("jsonb_populate_recordset")).toBeLessThan(
      migration.indexOf("update public.patient_availability"),
    );
    expect(migration).toMatch(/revoke all on function public\.replace_patient_weekly_availability[\s\S]+from public, anon/i);
    expect(migration).toMatch(/grant execute on function public\.replace_patient_weekly_availability[\s\S]+to authenticated/i);
  });
});
