import { beforeEach, describe, expect, it, vi } from 'vitest'

const getUser = vi.fn()
const rpc = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser },
    rpc,
  })),
}))

import { POST } from '@/app/api/calendar/mutate/route'

const validBody = {
  businessId: '11111111-1111-4111-8111-111111111111',
  operation: 'delete',
  appointmentId: '22222222-2222-4222-8222-222222222222',
  expectedVersion: 4,
  idempotencyKey: '33333333-3333-4333-8333-333333333333',
  values: {},
}

describe('calendar mutation API route', () => {
  beforeEach(() => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    rpc.mockReset()
  })

  it('maps an idempotency payload mismatch to a safe conflict response', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: '22023', message: 'IDEMPOTENCY_KEY_REUSE' },
    })

    const response = await POST(new Request('http://localhost/api/calendar/mutate', {
      method: 'POST',
      body: JSON.stringify(validBody),
    }))

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: 'idempotency key was already used for a different request',
    })
  })

  it('passes only validated operation values to the RPC', async () => {
    rpc.mockResolvedValue({
      data: { ok: true, appointment: null, warnings: [] },
      error: null,
    })

    const response = await POST(new Request('http://localhost/api/calendar/mutate', {
      method: 'POST',
      body: JSON.stringify(validBody),
    }))

    expect(response.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('calendar_validate_mutation', expect.objectContaining({
      p_expected_version: 4,
      p_values: {},
    }))
  })
})
