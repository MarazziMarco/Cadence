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
    'components/calendar/appointment-form.tsx',
    'components/calendar/optimize-preview.tsx',
    'components/ai/voice-appointment.tsx',
    'components/history/history-client.tsx',
    'components/lab/lab-client.tsx',
    'components/patients/treatment-plan-dialog.tsx',
    'components/patients/treatment-plan-edit-dialog.tsx',
    'components/patients/patient-profile.tsx',
  ])('uses canonical invalidation in %s', (path) => {
    const source = readFileSync(path, 'utf8')

    expect(source).toContain('invalidateCalendarAppointments')
  })

  it('keeps raw legacy appointment invalidation inside the shared helper', () => {
    const componentSources = [
      'components/calendar/appointment-form.tsx',
      'components/calendar/calendar-controller.tsx',
      'components/calendar/optimize-preview.tsx',
      'components/ai/voice-appointment.tsx',
      'components/history/history-client.tsx',
      'components/lab/lab-client.tsx',
      'components/patients/treatment-plan-dialog.tsx',
      'components/patients/treatment-plan-edit-dialog.tsx',
      'components/patients/patient-profile.tsx',
    ].map((path) => readFileSync(path, 'utf8')).join('\n')

    expect(componentSources).not.toMatch(
      /invalidateQueries\(\{\s*queryKey:\s*\['appointments'\]\s*\}\)/,
    )
  })
})
