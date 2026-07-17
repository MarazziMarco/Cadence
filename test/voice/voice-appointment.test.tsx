import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- mocks ------------------------------------------------------------------
const PATIENTS = [
  { id: "p1", first_name: "Marco", last_name: "Rossi", full_name: "Marco Rossi", address: null },
  { id: "p2", first_name: "Marco", last_name: "Bianchi", full_name: "Marco Bianchi", address: null },
  { id: "p5", first_name: "Giulia", last_name: "Verdi", full_name: "Giulia Verdi", address: "Via Roma 1" },
];

vi.mock("@/lib/workspace-context", () => ({
  useWorkspace: () => ({ business: { id: "b1", language: "en", default_appointment_duration: 30 } }),
}));
vi.mock("@/lib/i18n/use-t", () => ({ useT: () => ({ t: (k: string) => k, locale: "en" }) }));
vi.mock("@/lib/voice/use-speech", () => ({
  useSpeech: () => ({ supported: false, listening: false, start: vi.fn(), stop: vi.fn() }),
  speechLang: () => "en-US",
}));
vi.mock("@/lib/api/appointments", () => ({
  listPatientsForSelect: () => Promise.resolve(PATIENTS),
  createAppointment: vi.fn(() => Promise.resolve({ id: "a1" })),
}));
vi.mock("@/lib/api/services", () => ({ listServices: () => Promise.resolve([]) }));
vi.mock("@/lib/api/working-hours", () => ({ listWorkingHours: () => Promise.resolve([]) }));
vi.mock("@/lib/api/patients", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, createPatient: vi.fn(), updatePatient: vi.fn(), mergePatientWeeklyAvailability: vi.fn(), replacePatientWeeklyAvailability: vi.fn() };
});
vi.mock("@/lib/calendar/query-keys", () => ({ invalidateCalendarAppointments: vi.fn() }));

// Vendored ui primitives import "@/lib/utils" extensionless (vitest can't
// resolve) — stub the ones this component renders.
vi.mock("@/components/ui/card", () => ({ Card: (p: any) => <div {...p} />, CardContent: (p: any) => <div {...p} /> }));
vi.mock("@/components/ui/button", () => ({ Button: ({ children, ...p }: any) => <button {...p}>{children}</button> }));
vi.mock("@/components/ui/input", () => ({ Input: (p: any) => <input {...p} /> }));
vi.mock("@/components/ui/label", () => ({ Label: ({ children, ...p }: any) => <label {...p}>{children}</label> }));
vi.mock("@/components/ui/textarea", () => ({ Textarea: (p: any) => <textarea {...p} /> }));
vi.mock("@/components/ui/badge", () => ({ Badge: ({ children, ...p }: any) => <span {...p}>{children}</span> }));
vi.mock("@/components/ui/checkbox", () => ({ Checkbox: ({ onCheckedChange, ...p }: any) => <input type="checkbox" onChange={(e) => onCheckedChange?.(e.target.checked)} {...p} /> }));
vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: any) => <div>{children}</div>,
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/components/calendar/appointment-location-fields", () => ({
  AppointmentLocationFields: () => <div data-testid="location-fields" />,
  emptyLocation: (mode = "inherit") => ({ mode, address: "", city: "", postalCode: "" }),
}));

import { VoiceAppointment } from "@/components/ai/voice-appointment";

function renderVoice() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // Seed the cache so useQuery returns data synchronously on first render.
  client.setQueryData(["patients-select", "b1"], PATIENTS);
  client.setQueryData(["services", "b1"], []);
  client.setQueryData(["working-hours", "b1"], []);
  return render(
    <QueryClientProvider client={client}>
      <VoiceAppointment />
    </QueryClientProvider>,
  );
}

async function parse(text: string) {
  const user = userEvent.setup();
  const box = screen.getByPlaceholderText("e.g. Giulia on Friday at 10 checkup");
  await user.clear(box);
  await user.type(box, text);
  await user.click(screen.getByTestId("voice-parse"));
}

describe("VoiceAppointment — voice resolution preview", () => {
  beforeEach(() => vi.clearAllMocks());

  it("pre-fills a new-client name and disables nothing when the name is unknown", async () => {
    renderVoice();
    await parse("Anna domani alle 15");
    expect(screen.getByLabelText("vp.newClient")).toHaveValue("Anna");
    expect(screen.getByText("vp.newClient")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create appointment" })).toBeEnabled();
  });

  it("shows candidate buttons and disables create when the name is ambiguous", async () => {
    renderVoice();
    await parse("Marco domani alle 15");
    expect(screen.getByText("vp.ambiguous")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Marco Rossi" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Marco Bianchi" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create appointment" })).toBeDisabled();
  });

  it("previews parsed availability", async () => {
    renderVoice();
    await parse("Anna only monday");
    expect(screen.getByText("vp.availability")).toBeInTheDocument();
    expect(screen.getByText(/mon:/i)).toBeInTheDocument();
  });
});
