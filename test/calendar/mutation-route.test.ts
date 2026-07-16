import { describe, expect, it } from 'vitest'

import { parseCalendarMutationRequest } from '@/lib/calendar/mutation-request'

const IDS = {
  businessId: '11111111-1111-4111-8111-111111111111',
  appointmentId: '22222222-2222-4222-8222-222222222222',
  idempotencyKey: '33333333-3333-4333-8333-333333333333',
}

describe('calendar mutation route contract', () => {
  it('accepts only operation-specific move fields', () => {
    expect(() => parseCalendarMutationRequest({
      ...IDS,
      operation: 'move',
      expectedVersion: 3,
      values: {
        appointment_date: '2026-07-17',
        start_time: '10:00:00',
      },
    })).not.toThrow()

    expect(() => parseCalendarMutationRequest({
      ...IDS,
      operation: 'move',
      expectedVersion: 3,
      values: {
        appointment_date: '2026-07-17',
        start_time: '10:00:00',
        patient_id: '44444444-4444-4444-8444-444444444444',
      },
    })).toThrow(/move does not accept patient_id/)
  })

  it('rejects metadata for lock and unknown values for update', () => {
    expect(() => parseCalendarMutationRequest({
      ...IDS,
      operation: 'lock',
      expectedVersion: 3,
      values: { title: 'not allowed' },
    })).toThrow(/lock does not accept appointment values/)

    expect(() => parseCalendarMutationRequest({
      ...IDS,
      operation: 'update',
      expectedVersion: 3,
      values: { recurrence_rule: 'unexpected' },
    })).toThrow()
  })
})
