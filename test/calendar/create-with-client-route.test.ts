import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => Promise.resolve({ auth: { getUser }, rpc }),
}));

import { POST } from "@/app/api/calendar/create-with-client/route";
import { toRpcArgs } from "@/lib/calendar/create-with-client-request";

const BID = "11111111-1111-1111-1111-111111111111";
const SID = "22222222-2222-2222-2222-222222222222";

function req(body: unknown) {
  return new Request("http://test/api/calendar/create-with-client", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  businessId: BID,
  patient: { firstName: "Anna", lastName: "Neri" },
  appointment: { service_id: SID, appointment_date: "2026-07-20", start_time: "10:00", end_time: "10:30", duration_minutes: 30 },
  idempotencyKey: "k1",
};

describe("POST /api/calendar/create-with-client", () => {
  beforeEach(() => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    rpc.mockReset();
  });

  it("401 when unauthenticated", async () => {
    getUser.mockResolvedValueOnce({ data: { user: null } });
    const res = await POST(req(validBody));
    expect(res.status).toBe(401);
  });

  it("400 on an invalid request body", async () => {
    const res = await POST(req({ businessId: "not-a-uuid", patient: {}, appointment: {}, idempotencyKey: "" }));
    expect(res.status).toBe(400);
  });

  it("creates atomically and returns the rpc payload", async () => {
    rpc.mockResolvedValue({ data: { ok: true, appointment: { id: "a1" }, patient: { id: "p1" } }, error: null });
    const res = await POST(req(validBody));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, appointment: { id: "a1" }, patient: { id: "p1" } });
    expect(rpc).toHaveBeenCalledWith("create_appointment_with_client", expect.objectContaining({ p_business_id: BID }));
  });

  it("passes a warning response straight through (no orphan client)", async () => {
    rpc.mockResolvedValue({ data: { ok: false, code: "WARNING_CONFIRMATION", constraints: [{ code: "X", level: "warning", message: "m" }] }, error: null });
    const res = await POST(req(validBody));
    expect(res.status).toBe(200);
    expect((await res.json()).code).toBe("WARNING_CONFIRMATION");
  });

  it("maps a 42501 ownership error to 403", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "forbidden" } });
    const res = await POST(req(validBody));
    expect(res.status).toBe(403);
  });
});

describe("toRpcArgs", () => {
  it("shapes a new client", () => {
    const args = toRpcArgs(validBody as any);
    expect(args.p_patient).toMatchObject({ first_name: "Anna", last_name: "Neri" });
    expect(args.p_values).toMatchObject({ status: "scheduled", source: "manual", appointment_date: "2026-07-20" });
  });

  it("shapes an existing client by id", () => {
    const args = toRpcArgs({ ...validBody, patient: { id: SID } } as any);
    expect(args.p_patient).toEqual({ id: SID });
  });
});
