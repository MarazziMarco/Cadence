import { afterEach, describe, expect, it, vi } from 'vitest'

import { mutateCalendar } from '@/lib/api/calendar'

describe('mutateCalendar', () => {
  afterEach(() => vi.restoreAllMocks())

  it('sends the version and idempotency key to the authenticated route', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true, appointment: null, warnings: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await mutateCalendar({
      businessId: '11111111-1111-4111-8111-111111111111',
      operation: 'move',
      appointmentId: '22222222-2222-4222-8222-222222222222',
      expectedVersion: 3,
      idempotencyKey: '33333333-3333-4333-8333-333333333333',
      values: { appointment_date: '2026-07-17', start_time: '10:00:00' },
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/calendar/mutate',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: expect.stringContaining('"expectedVersion":3'),
      }),
    )
    expect(fetchMock.mock.calls[0]?.[1]?.body).toContain(
      '"idempotencyKey":"33333333-3333-4333-8333-333333333333"',
    )
  })

  it('returns the exact constraint response from a non-2xx request', async () => {
    const response = {
      ok: false,
      code: 'WARNING_CONFIRMATION',
      constraints: [
        {
          code: 'PATIENT_TIME_PREFERENCE',
          level: 'warning',
          message: 'The appointment is outside the patient preference.',
        },
      ],
    } as const
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(response), {
        status: 409,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await expect(
      mutateCalendar({
        businessId: '11111111-1111-4111-8111-111111111111',
        operation: 'create',
        idempotencyKey: '33333333-3333-4333-8333-333333333333',
        values: {},
      }),
    ).resolves.toEqual(response)
  })

  it('throws a safe server message when the response is not a mutation result', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await expect(
      mutateCalendar({
        businessId: '11111111-1111-4111-8111-111111111111',
        operation: 'delete',
        appointmentId: '22222222-2222-4222-8222-222222222222',
        expectedVersion: 4,
        idempotencyKey: '33333333-3333-4333-8333-333333333333',
        values: {},
      }),
    ).rejects.toThrow('unauthorized')
  })
})
