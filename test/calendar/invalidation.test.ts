import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'

import {
  calendarKeys,
  invalidateCalendarAppointments,
} from '@/lib/calendar/query-keys'

describe('invalidateCalendarAppointments', () => {
  it('invalidates canonical calendar data and legacy appointment consumers', () => {
    const invalidateQueries = vi.fn()

    invalidateCalendarAppointments(
      { invalidateQueries } as never,
      'business-1',
    )

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: calendarKeys.all('business-1'),
    })
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['appointments'],
    })
  })

  it.each([
    'components/calendar/appointment-dialog.tsx',
    'components/calendar/optimize-preview.tsx',
    'components/ai/voice-appointment.tsx',
  ])('uses canonical invalidation in %s', (path) => {
    const source = readFileSync(path, 'utf8')

    expect(source).toContain(
      'invalidateCalendarAppointments(qc, businessId)',
    )
  })
})
