import { describe, expect, it } from 'vitest'

import {
  calculateWeekDragPreview,
  weekDragDateAtX,
  type WeekDragGeometry,
} from '@/hooks/use-week-appointment-gesture'

const dates = [
  '2026-07-13',
  '2026-07-14',
  '2026-07-15',
  '2026-07-16',
  '2026-07-17',
  '2026-07-18',
  '2026-07-19',
]

const geometry: WeekDragGeometry = {
  dates,
  railWidth: 46,
  columnWidth: 100,
  contentLeft: 10,
}

describe('week appointment drag geometry', () => {
  it('selects Monday for an X position inside column zero', () => {
    expect(weekDragDateAtX(80, geometry)).toBe('2026-07-13')
  })

  it('selects Tuesday after crossing the first column boundary', () => {
    expect(weekDragDateAtX(157, geometry)).toBe('2026-07-14')
  })

  it('clamps X positions before and after the grid to Monday and Sunday', () => {
    expect(weekDragDateAtX(-100, geometry)).toBe('2026-07-13')
    expect(weekDragDateAtX(2_000, geometry)).toBe('2026-07-19')
  })

  it('recomputes the target day from the content offset after horizontal scroll', () => {
    expect(weekDragDateAtX(157, {
      ...geometry,
      contentLeft: -90,
    })).toBe('2026-07-15')
  })

  it('snaps vertical movement to the configured slot interval', () => {
    expect(calculateWeekDragPreview({
      geometry,
      clientX: 80,
      clientY: 222,
      originY: 200,
      startMinute: 9 * 60,
      startScrollTop: 100,
      scrollTop: 100,
      density: 60,
      snapIntervalMinutes: 15,
      rangeStart: 7 * 60,
      rangeEnd: 21 * 60,
      durationMinutes: 60,
    })).toEqual({
      date: '2026-07-13',
      startMinute: 9 * 60 + 15,
    })
  })

  it('includes vertical scroll delta when recomputing the snapped start', () => {
    expect(calculateWeekDragPreview({
      geometry,
      clientX: 80,
      clientY: 200,
      originY: 200,
      startMinute: 9 * 60,
      startScrollTop: 100,
      scrollTop: 130,
      density: 60,
      snapIntervalMinutes: 15,
      rangeStart: 7 * 60,
      rangeEnd: 21 * 60,
      durationMinutes: 60,
    }).startMinute).toBe(9 * 60 + 30)
  })
})
