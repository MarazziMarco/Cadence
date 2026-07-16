import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  CalendarMutationError,
  confirmCalendarMutation,
  confirmCalendarMutationInteractively,
  mutateCalendar,
  mutateCalendarOrThrow,
} from '@/lib/api/calendar'

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

  it('retries an exact warning confirmation with a fresh idempotency key', async () => {
    const warningResponse = {
      ok: false,
      code: 'WARNING_CONFIRMATION',
      constraints: [
        {
          code: 'PATIENT_TIME_PREFERENCE',
          level: 'warning',
          message: 'Outside the patient time window.',
        },
      ],
    } as const
    const successResponse = {
      ok: true,
      appointment: null,
      warnings: warningResponse.constraints,
    } as const
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json(warningResponse))
      .mockResolvedValueOnce(Response.json(successResponse))

    const request = {
      businessId: '11111111-1111-4111-8111-111111111111',
      operation: 'create' as const,
      idempotencyKey: '33333333-3333-4333-8333-333333333333',
      values: {
        patient_id: '22222222-2222-4222-8222-222222222222',
        appointment_date: '2026-07-17',
        start_time: '10:00:00',
        duration_minutes: 30,
      },
    }

    let warning: CalendarMutationError | null = null
    try {
      await mutateCalendarOrThrow(request)
    } catch (error) {
      expect(error).toBeInstanceOf(CalendarMutationError)
      warning = error as CalendarMutationError
    }

    expect(warning?.code).toBe('WARNING_CONFIRMATION')
    await expect(confirmCalendarMutation(warning!)).resolves.toEqual(successResponse)

    const firstBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    const retryBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))
    expect(retryBody.confirmWarnings).toEqual(['PATIENT_TIME_PREFERENCE'])
    expect(retryBody.values).toEqual(firstBody.values)
    expect(retryBody.idempotencyKey).not.toBe(firstBody.idempotencyKey)
  })

  it('shows the exact warning messages and does not retry when the user cancels', async () => {
    const request = {
      businessId: '11111111-1111-4111-8111-111111111111',
      operation: 'update' as const,
      appointmentId: '22222222-2222-4222-8222-222222222222',
      expectedVersion: 3,
      idempotencyKey: '33333333-3333-4333-8333-333333333333',
      values: { title: 'Updated' },
    }
    const warning = new CalendarMutationError({
      ok: false,
      code: 'WARNING_CONFIRMATION',
      constraints: [
        {
          code: 'PATIENT_TIME_PREFERENCE',
          level: 'warning',
          message: 'Patient prefers the morning.',
        },
        {
          code: 'BUSINESS_DAILY_TARGET',
          level: 'warning',
          message: 'Daily target reached.',
        },
      ],
    }, request)
    const confirmUser = vi.fn(() => false)
    const fetchMock = vi.spyOn(globalThis, 'fetch')

    await expect(
      confirmCalendarMutationInteractively(warning, confirmUser),
    ).resolves.toBeNull()
    expect(confirmUser).toHaveBeenCalledWith(expect.stringContaining('Patient prefers the morning.'))
    expect(confirmUser).toHaveBeenCalledWith(expect.stringContaining('Daily target reached.'))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('exposes stale-version failures with the loaded request context', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({
      ok: false,
      code: 'STALE_VERSION',
      constraints: [{
        code: 'STALE_VERSION',
        level: 'hard',
        message: 'The appointment changed since it was loaded.',
      }],
    }))
    const request = {
      businessId: '11111111-1111-4111-8111-111111111111',
      operation: 'delete' as const,
      appointmentId: '22222222-2222-4222-8222-222222222222',
      expectedVersion: 4,
      idempotencyKey: '33333333-3333-4333-8333-333333333333',
      values: {},
    }

    await expect(mutateCalendarOrThrow(request)).rejects.toMatchObject({
      code: 'STALE_VERSION',
      request,
    })
  })
})
