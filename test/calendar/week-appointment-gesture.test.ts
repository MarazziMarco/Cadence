import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  calculateWeekDragPreview,
  useWeekAppointmentGesture,
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

function gestureEvent(
  target: HTMLElement,
  pointerId: number,
  clientX = 80,
  clientY = 200,
) {
  return {
    pointerId,
    pointerType: 'touch',
    clientX,
    clientY,
    isPrimary: true,
    button: 0,
    currentTarget: target,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  }
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

describe('week appointment gesture lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('releases the active interlock when unmounted during a drag', () => {
    const viewport = document.createElement('div')
    const card = document.createElement('button')
    card.setPointerCapture = vi.fn()
    const scrollRef = { current: viewport }
    const onActiveChange = vi.fn()
    const { result, unmount } = renderHook(() => useWeekAppointmentGesture({
      appointmentId: 'appointment-1',
      expectedVersion: 1,
      date: dates[0],
      startMinute: 9 * 60,
      durationMinutes: 60,
      rangeStart: 7 * 60,
      rangeEnd: 21 * 60,
      density: 60,
      snapIntervalMinutes: 15,
      dates,
      railWidth: 46,
      columnWidth: 100,
      scrollRef,
      onActiveChange,
      onMove: vi.fn(),
    }))
    const event = gestureEvent(card, 71)

    act(() => {
      result.current.cardHandlers.onPointerDown(event as never)
      vi.advanceTimersByTime(450)
    })
    expect(onActiveChange).toHaveBeenCalledWith(true)

    unmount()

    expect(onActiveChange.mock.calls).toEqual([[true], [false]])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels on lost capture and does not finish twice after pointer up', () => {
    const viewport = document.createElement('div')
    const card = document.createElement('button')
    card.setPointerCapture = vi.fn()
    const scrollRef = { current: viewport }
    const onActiveChange = vi.fn()
    const onMove = vi.fn()
    const { result } = renderHook(() => useWeekAppointmentGesture({
      appointmentId: 'appointment-1',
      expectedVersion: 1,
      date: dates[0],
      startMinute: 9 * 60,
      durationMinutes: 60,
      rangeStart: 7 * 60,
      rangeEnd: 21 * 60,
      density: 60,
      snapIntervalMinutes: 15,
      dates,
      railWidth: 46,
      columnWidth: 100,
      scrollRef,
      onActiveChange,
      onMove,
    }))
    const event = gestureEvent(card, 72)

    act(() => {
      result.current.cardHandlers.onPointerDown(event as never)
      vi.advanceTimersByTime(450)
      result.current.cardHandlers.onLostPointerCapture(event as never)
      result.current.cardHandlers.onPointerUp(event as never)
    })

    expect(onMove).not.toHaveBeenCalled()
    expect(onActiveChange.mock.calls).toEqual([[true], [false]])
    expect(result.current.state.phase).toBe('idle')
    expect(vi.getTimerCount()).toBe(0)
  })
})
