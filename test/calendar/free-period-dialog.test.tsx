import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { runFreePeriodOptimization, fetchRun } = vi.hoisted(() => ({
  runFreePeriodOptimization: vi.fn(),
  fetchRun: vi.fn(),
}));
vi.mock("@/lib/api/scheduler", () => ({ runFreePeriodOptimization, fetchRun }));
vi.mock("@/lib/i18n/use-t", () => ({
  useT: () => ({ t: (k: string, vars?: Record<string, string>) => (vars ? `${k}:${Object.values(vars).join(",")}` : k), locale: "en" }),
}));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: (p: any) => (p.open ? <div>{p.children}</div> : null),
  DialogContent: (p: any) => <div>{p.children}</div>,
  DialogHeader: (p: any) => <div>{p.children}</div>,
  DialogTitle: (p: any) => <h2>{p.children}</h2>,
}));
vi.mock("@/components/calendar/optimize-preview", () => ({
  OptimizePreview: (p: any) => (
    <div data-testid="preview" data-exact={String(!!p.exact)}>
      {p.banner}
    </div>
  ),
}));

import { FreePeriodDialog } from "@/components/calendar/free-period-dialog";

describe("FreePeriodDialog", () => {
  beforeEach(() => {
    runFreePeriodOptimization.mockReset();
    fetchRun.mockReset();
    fetchRun.mockResolvedValue({ run: { id: "r1", idle_minutes_before: 0, idle_minutes_after: 0 }, changes: [] });
  });

  it("runs the evacuation and shows a partial result with blockers as an exact plan", async () => {
    runFreePeriodOptimization.mockResolvedValue({
      runId: "r1",
      completion: "partial",
      blockers: [{ appointment_id: "a1", patient_id: "p1", code: "LOCKED" }],
      exactPlan: true,
    });
    render(<FreePeriodDialog businessId="b1" date="2026-07-15" kind="day" open onOpenChange={() => {}} />);

    await waitFor(() => expect(runFreePeriodOptimization).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: "b1", date: "2026-07-15", kind: "day" }),
    ));
    expect(await screen.findByTestId("preview")).toHaveAttribute("data-exact", "true");
    expect(screen.getByText("fp.partial")).toBeInTheDocument();
    expect(screen.getByText("fp.blockers:1")).toBeInTheDocument();
    expect(screen.getByText(/fp\.blocker\.LOCKED/)).toBeInTheDocument();
  });

  it("shows a complete result with no blockers", async () => {
    runFreePeriodOptimization.mockResolvedValue({ runId: "r1", completion: "complete", blockers: [], exactPlan: true });
    render(<FreePeriodDialog businessId="b1" date="2026-07-15" kind="afternoon" open onOpenChange={() => {}} />);
    expect(await screen.findByText("fp.complete")).toBeInTheDocument();
    expect(screen.queryByText(/fp\.blockers/)).toBeNull();
  });

  it("does nothing until opened", () => {
    render(<FreePeriodDialog businessId="b1" date="2026-07-15" kind="day" open={false} onOpenChange={() => {}} />);
    expect(runFreePeriodOptimization).not.toHaveBeenCalled();
  });
});
