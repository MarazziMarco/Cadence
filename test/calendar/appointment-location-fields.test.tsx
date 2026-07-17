import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/i18n/use-t", () => ({
  useT: () => ({
    t: (k: string, vars?: Record<string, string>) => (vars ? `${k}:${Object.values(vars).join(",")}` : k),
    locale: "en",
  }),
}));
// Vendored ui primitives import "@/lib/utils" extensionless, which vitest can't
// resolve — stub them (repo test convention).
vi.mock("@/components/ui/input", () => ({ Input: (p: any) => <input {...p} /> }));
vi.mock("@/components/ui/label", () => ({ Label: ({ children, ...p }: any) => <label {...p}>{children}</label> }));

import {
  AppointmentLocationFields,
  emptyLocation,
  type AppointmentLocationValue,
} from "@/components/calendar/appointment-location-fields";

function Harness({ initial, studioAddress, patientAddress }: {
  initial: AppointmentLocationValue;
  studioAddress?: string | null;
  patientAddress?: string | null;
}) {
  const [value, setValue] = useState(initial);
  return <AppointmentLocationFields value={value} onChange={setValue} studioAddress={studioAddress} patientAddress={patientAddress} />;
}

describe("AppointmentLocationFields", () => {
  it("defaults a parsed appointment address to Custom with editable fields", () => {
    render(<Harness initial={{ mode: "custom", address: "via Milano 5", city: "", postalCode: "" }} />);
    expect(screen.getByRole("button", { name: "loc.custom" })).toHaveAttribute("aria-pressed", "true");
    expect((screen.getByLabelText("loc.address") as HTMLInputElement).value).toBe("via Milano 5");
  });

  it("shows an effective read-only address for the Studio mode", () => {
    render(<Harness initial={emptyLocation("studio")} studioAddress="Via Studio 9" />);
    expect(screen.getByText("loc.uses:Via Studio 9")).toBeInTheDocument();
    expect(screen.queryByLabelText("loc.address")).toBeNull();
  });

  it("falls back to a no-address label when none is on file", () => {
    render(<Harness initial={emptyLocation("patient")} patientAddress={null} />);
    expect(screen.getByText("loc.uses:loc.noAddress")).toBeInTheDocument();
  });

  it("lets the user switch to Custom and reveal the fields", async () => {
    const user = userEvent.setup();
    render(<Harness initial={emptyLocation("inherit")} studioAddress="Via Studio 9" />);
    expect(screen.queryByLabelText("loc.address")).toBeNull();
    await user.click(screen.getByRole("button", { name: "loc.custom" }));
    expect(screen.getByLabelText("loc.address")).toBeInTheDocument();
  });
});
