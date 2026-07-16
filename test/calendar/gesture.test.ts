import { describe, expect, it, vi } from 'vitest'

import {
  CALENDAR_LONG_PRESS_MS,
  calendarGestureReducer,
  gestureTouchAction,
  initialCalendarGestureState,
} from '@/hooks/use-calendar-gesture'
import { pinchZoomIgnoresTarget } from '@/hooks/use-pinch-zoom'

describe('calendarGestureReducer', () => {
  it('keeps header pinch targets out of vertical body zoom', () => {
    const header = document.createElement('div')
    header.setAttribute('data-pinch-zoom-ignore', '')
    const child = document.createElement('span')
    header.appendChild(child)

    expect(pinchZoomIgnoresTarget(child)).toBe(true)
    expect(pinchZoomIgnoresTarget(document.createElement('div'))).toBe(false)
  })

  it('cancels a pending long press after movement exceeds 8px', () => {
    const pressing = calendarGestureReducer(initialCalendarGestureState, {
      type: 'pointer-down',
      mode: 'move',
      pointerId: 1,
      x: 10,
      y: 10,
      at: 0,
    })

    expect(calendarGestureReducer(pressing, {
      type: 'pointer-move',
      x: 19,
      y: 10,
    })).toEqual(initialCalendarGestureState)
  })

  it('activates move mode after the 450ms long press', () => {
    vi.useFakeTimers()
    let state = calendarGestureReducer(initialCalendarGestureState, {
      type: 'pointer-down',
      mode: 'move',
      pointerId: 1,
      x: 10,
      y: 10,
      at: 0,
    })
    setTimeout(() => {
      state = calendarGestureReducer(state, {
        type: 'activate',
        at: CALENDAR_LONG_PRESS_MS,
      })
    }, CALENDAR_LONG_PRESS_MS)

    vi.advanceTimersByTime(CALENDAR_LONG_PRESS_MS)
    expect(state.phase).toBe('active')
    expect(state.mode).toBe('move')
    vi.useRealTimers()
  })

  it('enters resize mode only when the lower handle starts the gesture', () => {
    const pressing = calendarGestureReducer(initialCalendarGestureState, {
      type: 'pointer-down',
      mode: 'resize',
      pointerId: 2,
      x: 20,
      y: 80,
      at: 0,
    })
    const active = calendarGestureReducer(pressing, {
      type: 'activate',
      at: CALENDAR_LONG_PRESS_MS,
    })

    expect(active.phase).toBe('active')
    expect(active.mode).toBe('resize')
  })

  it('returns to idle on pointercancel', () => {
    const pressing = calendarGestureReducer(initialCalendarGestureState, {
      type: 'pointer-down',
      mode: 'move',
      pointerId: 1,
      x: 0,
      y: 0,
      at: 0,
    })

    expect(calendarGestureReducer(pressing, {
      type: 'pointer-cancel',
    })).toEqual(initialCalendarGestureState)
  })

  it('keeps touch scrolling enabled until activation', () => {
    const pressing = calendarGestureReducer(initialCalendarGestureState, {
      type: 'pointer-down',
      mode: 'move',
      pointerId: 1,
      x: 0,
      y: 0,
      at: 0,
    })
    const active = calendarGestureReducer(pressing, {
      type: 'activate',
      at: CALENDAR_LONG_PRESS_MS,
    })

    expect(gestureTouchAction(pressing)).toBe('pan-y')
    expect(gestureTouchAction(active)).toBe('none')
  })
})
