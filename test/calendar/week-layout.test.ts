import { describe, expect, it } from 'vitest'

import {
  PHONE_WEEK_LAYOUT_STORAGE_KEY,
  clampVisibleWeekDays,
  parsePhoneWeekLayout,
  selectedDayScrollLeft,
  weekColumnWidth,
} from '@/lib/calendar/week-layout'

describe('phone week layout', () => {
  it('defaults invalid device-local preferences to grid', () => {
    expect(PHONE_WEEK_LAYOUT_STORAGE_KEY)
      .toBe('cadence.calendar.phoneWeekLayout')
    expect(parsePhoneWeekLayout(null)).toBe('grid')
    expect(parsePhoneWeekLayout('unknown')).toBe('grid')
    expect(parsePhoneWeekLayout('timeline')).toBe('timeline')
  })

  it('keeps continuous week zoom between three and seven days', () => {
    expect(clampVisibleWeekDays(2.4)).toBe(3)
    expect(clampVisibleWeekDays(4.25)).toBe(4.25)
    expect(clampVisibleWeekDays(8)).toBe(7)
    expect(weekColumnWidth(350, 7)).toBe(50)
    expect(weekColumnWidth(350, 3.5)).toBe(100)
  })

  it('centers the selected day without scrolling outside the week', () => {
    expect(selectedDayScrollLeft({
      containerWidth: 350,
      columnWidth: 100,
      selectedIndex: 3,
      dayCount: 7,
    })).toBe(175)
    expect(selectedDayScrollLeft({
      containerWidth: 350,
      columnWidth: 100,
      selectedIndex: 0,
      dayCount: 7,
    })).toBe(0)
  })
})
