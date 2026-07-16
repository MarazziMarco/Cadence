'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'

import { minToTime } from '@/lib/api/appointments'
import type { MoveIntent, ResizeIntent } from '@/lib/calendar/types'

export const CALENDAR_LONG_PRESS_MS = 450
export const CALENDAR_MOVE_CANCEL_PX = 8

export type CalendarGestureMode = 'move' | 'resize'

export interface CalendarGestureState {
  phase: 'idle' | 'pressing' | 'active'
  mode: CalendarGestureMode | null
  pointerId: number | null
  originX: number
  originY: number
  x: number
  y: number
  startedAt: number
}

export type CalendarGestureEvent =
  | {
      type: 'pointer-down'
      mode: CalendarGestureMode
      pointerId: number
      x: number
      y: number
      at: number
    }
  | { type: 'pointer-move'; x: number; y: number }
  | { type: 'activate'; at: number }
  | { type: 'pointer-up' | 'pointer-cancel' }

export const initialCalendarGestureState: CalendarGestureState = {
  phase: 'idle',
  mode: null,
  pointerId: null,
  originX: 0,
  originY: 0,
  x: 0,
  y: 0,
  startedAt: 0,
}

export function calendarGestureReducer(
  state: CalendarGestureState,
  event: CalendarGestureEvent,
): CalendarGestureState {
  if (event.type === 'pointer-down') {
    return {
      phase: 'pressing',
      mode: event.mode,
      pointerId: event.pointerId,
      originX: event.x,
      originY: event.y,
      x: event.x,
      y: event.y,
      startedAt: event.at,
    }
  }

  if (event.type === 'pointer-cancel' || event.type === 'pointer-up') {
    return initialCalendarGestureState
  }

  if (state.phase === 'idle') return state

  if (event.type === 'activate') {
    if (
      state.phase !== 'pressing'
      || event.at - state.startedAt < CALENDAR_LONG_PRESS_MS
    ) return state
    return { ...state, phase: 'active' }
  }

  const distance = Math.hypot(
    event.x - state.originX,
    event.y - state.originY,
  )
  if (
    state.phase === 'pressing'
    && distance > CALENDAR_MOVE_CANCEL_PX
  ) {
    return initialCalendarGestureState
  }

  return { ...state, x: event.x, y: event.y }
}

export function gestureTouchAction(
  state: CalendarGestureState,
): 'pan-y' | 'none' {
  return state.phase === 'active' ? 'none' : 'pan-y'
}

export interface CalendarGesturePreview {
  mode: CalendarGestureMode
  startMinute: number
  durationMinutes: number
}

interface UseCalendarGestureOptions {
  appointmentId: string
  expectedVersion: number
  date: string
  startMinute: number
  durationMinutes: number
  rangeStart: number
  rangeEnd: number
  density: number
  snapIntervalMinutes: number
  scrollRef: RefObject<HTMLElement | null>
  disabled?: boolean
  onActiveChange?(active: boolean): void
  onMove(request: MoveIntent): void
  onResize(request: ResizeIntent): void
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function snap(value: number, interval: number) {
  return Math.round(value / interval) * interval
}

function previewLabel(preview: CalendarGesturePreview) {
  const endMinute = preview.startMinute + preview.durationMinutes
  return `${minToTime(preview.startMinute).slice(0, 5)}–${
    minToTime(endMinute).slice(0, 5)
  }, ${preview.durationMinutes} minutes`
}

export function useCalendarGesture({
  appointmentId,
  expectedVersion,
  date,
  startMinute,
  durationMinutes,
  rangeStart,
  rangeEnd,
  density,
  snapIntervalMinutes,
  scrollRef,
  disabled = false,
  onActiveChange,
  onMove,
  onResize,
}: UseCalendarGestureOptions) {
  const [state, setState] = useState(initialCalendarGestureState)
  const [preview, setPreview] = useState<CalendarGesturePreview | null>(null)
  const stateRef = useRef(state)
  const activationTimerRef = useRef<number | null>(null)
  const previewFrameRef = useRef<number | null>(null)
  const autoScrollFrameRef = useRef<number | null>(null)
  const autoScrollDirectionRef = useRef(0)
  const lastClientYRef = useRef(0)
  const startScrollTopRef = useRef(0)
  const suppressClickRef = useRef(false)

  const transition = useCallback((event: CalendarGestureEvent) => {
    const next = calendarGestureReducer(stateRef.current, event)
    stateRef.current = next
    setState(next)
    return next
  }, [])

  const clearActivationTimer = useCallback(() => {
    if (activationTimerRef.current !== null) {
      window.clearTimeout(activationTimerRef.current)
      activationTimerRef.current = null
    }
  }, [])

  const stopAutoScroll = useCallback(() => {
    autoScrollDirectionRef.current = 0
    if (autoScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(autoScrollFrameRef.current)
      autoScrollFrameRef.current = null
    }
  }, [])

  const calculatePreview = useCallback((clientY: number) => {
    const current = stateRef.current
    if (current.phase !== 'active' || !current.mode) return null
    const scrollDelta = (
      (scrollRef.current?.scrollTop ?? 0) - startScrollTopRef.current
    )
    const deltaPixels = clientY - current.originY + scrollDelta
    const deltaMinutes = snap(
      (deltaPixels / density) * 60,
      snapIntervalMinutes,
    )

    if (current.mode === 'move') {
      const latestStart = Math.max(
        rangeStart,
        rangeEnd - durationMinutes,
      )
      return {
        mode: current.mode,
        startMinute: clamp(
          startMinute + deltaMinutes,
          rangeStart,
          latestStart,
        ),
        durationMinutes,
      } satisfies CalendarGesturePreview
    }

    return {
      mode: current.mode,
      startMinute,
      durationMinutes: clamp(
        durationMinutes + deltaMinutes,
        snapIntervalMinutes,
        Math.max(snapIntervalMinutes, rangeEnd - startMinute),
      ),
    } satisfies CalendarGesturePreview
  }, [
    density,
    durationMinutes,
    rangeEnd,
    rangeStart,
    scrollRef,
    snapIntervalMinutes,
    startMinute,
  ])

  const schedulePreview = useCallback((clientY: number) => {
    lastClientYRef.current = clientY
    if (previewFrameRef.current !== null) return
    previewFrameRef.current = window.requestAnimationFrame(() => {
      previewFrameRef.current = null
      setPreview(calculatePreview(lastClientYRef.current))
    })
  }, [calculatePreview])

  const runAutoScroll = useCallback(() => {
    const scrollContainer = scrollRef.current
    if (!scrollContainer || autoScrollDirectionRef.current === 0) {
      autoScrollFrameRef.current = null
      return
    }
    scrollContainer.scrollTop += autoScrollDirectionRef.current * 7
    schedulePreview(lastClientYRef.current)
    autoScrollFrameRef.current = window.requestAnimationFrame(runAutoScroll)
  }, [schedulePreview, scrollRef])

  const updateAutoScroll = useCallback((clientY: number) => {
    const scrollContainer = scrollRef.current
    if (!scrollContainer) return
    const bounds = scrollContainer.getBoundingClientRect()
    const edge = 48
    autoScrollDirectionRef.current = clientY < bounds.top + edge
      ? -1
      : clientY > bounds.bottom - edge
        ? 1
        : 0
    if (
      autoScrollDirectionRef.current !== 0
      && autoScrollFrameRef.current === null
    ) {
      autoScrollFrameRef.current = window.requestAnimationFrame(runAutoScroll)
    } else if (autoScrollDirectionRef.current === 0) {
      stopAutoScroll()
    }
  }, [runAutoScroll, scrollRef, stopAutoScroll])

  const begin = useCallback((
    mode: CalendarGestureMode,
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    if (disabled || !event.isPrimary || event.button !== 0) return
    if (mode === 'resize') event.stopPropagation()
    clearActivationTimer()
    stopAutoScroll()
    setPreview(null)
    suppressClickRef.current = false
    startScrollTopRef.current = scrollRef.current?.scrollTop ?? 0
    lastClientYRef.current = event.clientY
    event.currentTarget.setPointerCapture?.(event.pointerId)
    transition({
      type: 'pointer-down',
      mode,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      at: performance.now(),
    })
    activationTimerRef.current = window.setTimeout(() => {
      const next = transition({
        type: 'activate',
        at: performance.now(),
      })
      if (next.phase !== 'active') return
      suppressClickRef.current = true
      onActiveChange?.(true)
      navigator.vibrate?.(15)
      schedulePreview(lastClientYRef.current)
    }, CALENDAR_LONG_PRESS_MS)
  }, [
    clearActivationTimer,
    disabled,
    onActiveChange,
    schedulePreview,
    scrollRef,
    stopAutoScroll,
    transition,
  ])

  const handlePointerMove = useCallback((
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    const before = stateRef.current
    if (before.pointerId !== event.pointerId) return
    const next = transition({
      type: 'pointer-move',
      x: event.clientX,
      y: event.clientY,
    })
    if (before.phase === 'pressing' && next.phase === 'idle') {
      clearActivationTimer()
      return
    }
    if (next.phase !== 'active') return
    event.preventDefault()
    event.stopPropagation()
    schedulePreview(event.clientY)
    updateAutoScroll(event.clientY)
  }, [
    clearActivationTimer,
    schedulePreview,
    transition,
    updateAutoScroll,
  ])

  const finish = useCallback((
    event: ReactPointerEvent<HTMLElement>,
    cancelled = false,
  ) => {
    const current = stateRef.current
    if (current.pointerId !== event.pointerId) return
    clearActivationTimer()
    stopAutoScroll()
    if (previewFrameRef.current !== null) {
      window.cancelAnimationFrame(previewFrameRef.current)
      previewFrameRef.current = null
    }

    if (!cancelled && current.phase === 'active' && current.mode) {
      event.preventDefault()
      event.stopPropagation()
      const finalPreview = calculatePreview(event.clientY) ?? preview
      if (
        finalPreview?.mode === 'move'
        && finalPreview.startMinute !== startMinute
      ) {
        onMove({
          appointmentId,
          expectedVersion,
          date,
          startMinute: finalPreview.startMinute,
        })
      } else if (
        finalPreview?.mode === 'resize'
        && finalPreview.durationMinutes !== durationMinutes
      ) {
        onResize({
          appointmentId,
          expectedVersion,
          durationMinutes: finalPreview.durationMinutes,
        })
      }
    }

    transition({ type: cancelled ? 'pointer-cancel' : 'pointer-up' })
    if (current.phase === 'active') onActiveChange?.(false)
    setPreview(null)
  }, [
    appointmentId,
    calculatePreview,
    clearActivationTimer,
    date,
    durationMinutes,
    expectedVersion,
    onMove,
    onResize,
    onActiveChange,
    preview,
    startMinute,
    stopAutoScroll,
    transition,
  ])

  useEffect(() => () => {
    clearActivationTimer()
    stopAutoScroll()
    if (previewFrameRef.current !== null) {
      window.cancelAnimationFrame(previewFrameRef.current)
    }
  }, [clearActivationTimer, stopAutoScroll])

  useEffect(() => {
    if (!disabled) return
    const wasActive = stateRef.current.phase === 'active'
    clearActivationTimer()
    stopAutoScroll()
    transition({ type: 'pointer-cancel' })
    setPreview(null)
    if (wasActive) onActiveChange?.(false)
  }, [
    clearActivationTimer,
    disabled,
    onActiveChange,
    stopAutoScroll,
    transition,
  ])

  return {
    state,
    preview,
    touchAction: gestureTouchAction(state),
    liveValue: preview ? previewLabel(preview) : '',
    cardHandlers: {
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) => begin(
        'move',
        event,
      ),
      onPointerMove: handlePointerMove,
      onPointerUp: (event: ReactPointerEvent<HTMLElement>) => finish(event),
      onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => finish(
        event,
        true,
      ),
    },
    resizeHandlers: {
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) => begin(
        'resize',
        event,
      ),
      onPointerMove: handlePointerMove,
      onPointerUp: (event: ReactPointerEvent<HTMLElement>) => finish(event),
      onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => finish(
        event,
        true,
      ),
    },
    consumeClickSuppression() {
      const suppressed = suppressClickRef.current
      suppressClickRef.current = false
      return suppressed
    },
  }
}
