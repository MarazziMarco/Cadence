import { describe, expect, it } from 'vitest'

import {
  addBusinessDays,
  businessToday,
  formatBusinessDate,
  monthRange,
  monthWeekBuckets,
  weekRange,
} from '@/lib/calendar/date'

describe('business calendar dates', () => {
  it('uses business timezone instead of device timezone', () => {
    const now = new Date('2026-07-16T22:30:00.000Z')

    expect(businessToday('Europe/Rome', now)).toBe('2026-07-17')
    expect(businessToday('America/New_York', now)).toBe('2026-07-16')
  })

  it('adds positive and negative days across month, year, and leap boundaries', () => {
    expect(addBusinessDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addBusinessDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addBusinessDays('2028-02-28', 1)).toBe('2028-02-29')
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 1.5, -1.5])(
    'rejects non-finite and fractional day amounts: %s',
    (amount) => {
      expect(() => addBusinessDays('2026-07-16', amount)).toThrow(RangeError)
    },
  )

  it.each([
    ['0000-01-01', -1],
    ['9999-12-31', 1],
  ] as const)(
    'rejects arithmetic outside the canonical date-only year range: %s %d',
    (date, amount) => {
      expect(() => addBusinessDays(date, amount)).toThrow(RangeError)
    },
  )

  it('returns Monday-Sunday week range across month boundaries', () => {
    expect(weekRange('2026-07-16')).toEqual({
      from: '2026-07-13',
      to: '2026-07-19',
    })
    expect(weekRange('2026-08-01')).toEqual({
      from: '2026-07-27',
      to: '2026-08-02',
    })
  })

  it('returns the containing calendar month range', () => {
    expect(monthRange('2026-07-16')).toEqual({
      from: '2026-07-01',
      to: '2026-07-31',
    })
    expect(monthRange('2028-02-29')).toEqual({
      from: '2028-02-01',
      to: '2028-02-29',
    })
  })

  it('splits a month into Monday-Sunday buckets clipped to month', () => {
    expect(monthWeekBuckets('2026-07-16')).toEqual([
      { key: '2026-07-01', from: '2026-07-01', to: '2026-07-05' },
      { key: '2026-07-06', from: '2026-07-06', to: '2026-07-12' },
      { key: '2026-07-13', from: '2026-07-13', to: '2026-07-19' },
      { key: '2026-07-20', from: '2026-07-20', to: '2026-07-26' },
      { key: '2026-07-27', from: '2026-07-27', to: '2026-07-31' },
    ])
  })

  it('formats date-only values without shifting the calendar day', () => {
    expect(
      formatBusinessDate('2026-07-16', 'en-GB', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }),
    ).toBe('16 July 2026')
  })
})
