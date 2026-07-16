import { readFileSync } from 'node:fs'
import { join } from 'node:path'

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
const locationMigration = readFileSync(
  join(process.cwd(), 'supabase/migrations/202607160004_client_locations_and_availability.sql'),
  'utf8',
)

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

  it('passes normalized create location values to the RPC', async () => {
    rpc.mockResolvedValue({
      data: { ok: true, appointment: null, warnings: [] },
      error: null,
    })

    const response = await POST(new Request('http://localhost/api/calendar/mutate', {
      method: 'POST',
      body: JSON.stringify({
        businessId: validBody.businessId,
        operation: 'create',
        idempotencyKey: validBody.idempotencyKey,
        values: {
          patient_id: '44444444-4444-4444-8444-444444444444',
          appointment_date: '2026-07-17',
          start_time: '10:00:00',
          duration_minutes: 60,
          location_mode: 'custom',
          location_address: '  Via Roma 10  ',
          location_city: ' ',
          location_postal_code: '',
        },
      }),
    }))

    expect(response.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('calendar_validate_mutation', expect.objectContaining({
      p_values: expect.objectContaining({
        location_mode: 'custom',
        location_address: 'Via Roma 10',
        location_city: null,
        location_postal_code: null,
      }),
    }))
  })

  it('extends the validated SQL mutation with location handling', () => {
    expect(locationMigration).toMatch(/create or replace function public\.calendar_validate_mutation/i)
    expect(locationMigration).toMatch(/location_mode/i)
    expect(locationMigration).toMatch(/location_address/i)
    expect(locationMigration).toMatch(/location_city/i)
    expect(locationMigration).toMatch(/location_postal_code/i)
    expect(locationMigration).toMatch(/PATIENT_LOCATION_REQUIRED/i)
    expect(locationMigration).toMatch(/CUSTOM_LOCATION_REQUIRED/i)
  })
})
