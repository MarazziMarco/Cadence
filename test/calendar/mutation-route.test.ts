import { describe, expect, it } from 'vitest'

import { parseCalendarMutationRequest } from '@/lib/calendar/mutation-request'

const IDS = {
  businessId: '11111111-1111-4111-8111-111111111111',
  appointmentId: '22222222-2222-4222-8222-222222222222',
  idempotencyKey: '33333333-3333-4333-8333-333333333333',
}
const PATIENT_ID = '44444444-4444-4444-8444-444444444444'

describe('calendar mutation route contract', () => {
  it('accepts and normalizes location fields for create and update', () => {
    const created = parseCalendarMutationRequest({
      businessId: IDS.businessId,
      operation: 'create',
      idempotencyKey: IDS.idempotencyKey,
      values: {
        patient_id: PATIENT_ID,
        appointment_date: '2026-07-17',
        start_time: '10:00:00',
        duration_minutes: 60,
        location_mode: 'custom',
        location_address: '  Via Roma 10  ',
        location_city: '   ',
        location_postal_code: '',
      },
    })

    expect(created.values).toMatchObject({
      location_mode: 'custom',
      location_address: 'Via Roma 10',
      location_city: null,
      location_postal_code: null,
    })

    expect(() => parseCalendarMutationRequest({
      ...IDS,
      operation: 'update',
      expectedVersion: 3,
      values: {
        location_mode: 'patient',
        location_address: null,
        location_city: null,
        location_postal_code: null,
      },
    })).not.toThrow()
  })

  it('rejects invalid or incomplete location values', () => {
    expect(() => parseCalendarMutationRequest({
      ...IDS,
      operation: 'update',
      expectedVersion: 3,
      values: { location_mode: 'somewhere-else' },
    })).toThrow()

    expect(() => parseCalendarMutationRequest({
      ...IDS,
      operation: 'update',
      expectedVersion: 3,
      values: {
        location_mode: 'custom',
        location_address: '   ',
      },
    })).toThrow(/custom location requires an address/i)
  })

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
        patient_id: PATIENT_ID,
      },
    })).toThrow(/move does not accept patient_id/)

    expect(() => parseCalendarMutationRequest({
      ...IDS,
      operation: 'move',
      expectedVersion: 3,
      values: {
        appointment_date: '2026-07-17',
        start_time: '10:00:00',
        location_mode: 'studio',
      },
    })).toThrow(/move does not accept location_mode/)
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
