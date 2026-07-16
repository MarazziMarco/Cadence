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
import type { MoveIntent } from '@/lib/calendar/types'
import {
  CALENDAR_LONG_PRESS_MS,
  calendarGestureReducer,
  gestureTouchAction,
  initialCalendarGestureState,
  type CalendarGestureEvent,
} from '@/hooks/use-calendar-gesture'

export interface WeekDragGeometry {
  dates: string[]
  railWidth: number
  columnWidth: number
  contentLeft: number
}

export interface WeekDragPreview {
  date: string
  startMinute: number
}

interface WeekDragPreviewInput {
  geometry: WeekDragGeometry
  clientX: number
  clientY: number
  originY: number
  startMinute: number
  startScrollTop: number
  scrollTop: number
  density: number
  snapIntervalMinutes: number
  rangeStart: number
  rangeEnd: number
  durationMinutes: number
}

interface UseWeekAppointmentGestureOptions {
  appointmentId: string
  expectedVersion: number
  date: string
  startMinute: number
  durationMinutes: number
  rangeStart: number
  rangeEnd: number
  density: number
  snapIntervalMinutes: number
  dates: string[]
  railWidth: number
  columnWidth: number
  scrollRef: RefObject<HTMLElement | null>
  disabled?: boolean
  onActiveChange?(active: boolean): void
  onMove(request: MoveIntent): void
}

interface AutoScrollDirection {
  x: number
  y: number
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function snap(value: number, interval: number) {
  return Math.round(value / interval) * interval
}

export function weekDragDateAtX(
  clientX: number,
  geometry: WeekDragGeometry,
) {
  const rawIndex = Math.floor(
    (
      clientX
      - geometry.contentLeft
      - geometry.railWidth
    ) / geometry.columnWidth,
  )
  const index = clamp(rawIndex, 0, geometry.dates.length - 1)
  return geometry.dates[index]
}

export function calculateWeekDragPreview({
  geometry,
  clientX,
  clientY,
  originY,
  startMinute,
  startScrollTop,
  scrollTop,
  density,
  snapIntervalMinutes,
  rangeStart,
  rangeEnd,
  durationMinutes,
}: WeekDragPreviewInput): WeekDragPreview {
  const scrollDelta = scrollTop - startScrollTop
  const deltaMinutes = snap(
    ((clientY - originY + scrollDelta) / density) * 60,
    snapIntervalMinutes,
  )
  const latestStart = Math.max(rangeStart, rangeEnd - durationMinutes)
  return {
    date: weekDragDateAtX(clientX, geometry),
    startMinute: clamp(
      startMinute + deltaMinutes,
      rangeStart,
      latestStart,
    ),
  }
}

function previewLabel(preview: WeekDragPreview, durationMinutes: number) {
  const start = minToTime(preview.startMinute).slice(0, 5)
  const end = minToTime(preview.startMinute + durationMinutes).slice(0, 5)
  return `${preview.date}, ${start}–${end}, ${durationMinutes} minutes`
}

export function useWeekAppointmentGesture({
  appointmentId,
  expectedVersion,
  date,
  startMinute,
  durationMinutes,
  rangeStart,
  rangeEnd,
  density,
  snapIntervalMinutes,
  dates,
  railWidth,
  columnWidth,
  scrollRef,
  disabled = false,
  onActiveChange,
  onMove,
}: UseWeekAppointmentGestureOptions) {
  const [state, setState] = useState(initialCalendarGestureState)
  const [preview, setPreview] = useState<WeekDragPreview | null>(null)
  const stateRef = useRef(state)
  const activationTimerRef = useRef<number | null>(null)
  const previewFrameRef = useRef<number | null>(null)
  const autoScrollFrameRef = useRef<number | null>(null)
  const autoScrollDirectionRef = useRef<AutoScrollDirection>({ x: 0, y: 0 })
  const lastClientXRef = useRef(0)
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
    if (activationTimerRef.current === null) return
    window.clearTimeout(activationTimerRef.current)
    activationTimerRef.current = null
  }, [])

  const stopAutoScroll = useCallback(() => {
    autoScrollDirectionRef.current = { x: 0, y: 0 }
    if (autoScrollFrameRef.current === null) return
    window.cancelAnimationFrame(autoScrollFrameRef.current)
    autoScrollFrameRef.current = null
  }, [])

  const calculatePreview = useCallback((
    clientX: number,
    clientY: number,
  ) => {
    const current = stateRef.current
    const scrollContainer = scrollRef.current
    if (current.phase !== 'active' || !scrollContainer) return null
    const bounds = scrollContainer.getBoundingClientRect()
    return calculateWeekDragPreview({
      geometry: {
        dates,
        railWidth,
        columnWidth,
        contentLeft: bounds.left - scrollContainer.scrollLeft,
      },
      clientX,
      clientY,
      originY: current.originY,
      startMinute,
      startScrollTop: startScrollTopRef.current,
      scrollTop: scrollContainer.scrollTop,
      density,
      snapIntervalMinutes,
      rangeStart,
      rangeEnd,
      durationMinutes,
    })
  }, [
    columnWidth,
    dates,
    density,
    durationMinutes,
    railWidth,
    rangeEnd,
    rangeStart,
    scrollRef,
    snapIntervalMinutes,
    startMinute,
  ])

  const schedulePreview = useCallback((
    clientX: number,
    clientY: number,
  ) => {
    lastClientXRef.current = clientX
    lastClientYRef.current = clientY
    if (previewFrameRef.current !== null) return
    previewFrameRef.current = window.requestAnimationFrame(() => {
      previewFrameRef.current = null
      setPreview(calculatePreview(
        lastClientXRef.current,
        lastClientYRef.current,
      ))
    })
  }, [calculatePreview])

  const runAutoScroll = useCallback(() => {
    const scrollContainer = scrollRef.current
    const direction = autoScrollDirectionRef.current
    if (!scrollContainer || (direction.x === 0 && direction.y === 0)) {
      autoScrollFrameRef.current = null
      return
    }
    scrollContainer.scrollLeft += direction.x * 7
    scrollContainer.scrollTop += direction.y * 7
    schedulePreview(lastClientXRef.current, lastClientYRef.current)
    autoScrollFrameRef.current = window.requestAnimationFrame(runAutoScroll)
  }, [schedulePreview, scrollRef])

  const updateAutoScroll = useCallback((
    clientX: number,
    clientY: number,
  ) => {
    const scrollContainer = scrollRef.current
    if (!scrollContainer) return
    const bounds = scrollContainer.getBoundingClientRect()
    const edge = 48
    const direction = {
      x: clientX < bounds.left + edge
        ? -1
        : clientX > bounds.right - edge
          ? 1
          : 0,
      y: clientY < bounds.top + edge
        ? -1
        : clientY > bounds.bottom - edge
          ? 1
          : 0,
    }
    autoScrollDirectionRef.current = direction
    if (
      (direction.x !== 0 || direction.y !== 0)
      && autoScrollFrameRef.current === null
    ) {
      autoScrollFrameRef.current = window.requestAnimationFrame(runAutoScroll)
    } else if (direction.x === 0 && direction.y === 0) {
      stopAutoScroll()
    }
  }, [runAutoScroll, scrollRef, stopAutoScroll])

  const begin = useCallback((
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    if (disabled || !event.isPrimary || event.button !== 0) return
    clearActivationTimer()
    stopAutoScroll()
    setPreview(null)
    suppressClickRef.current = false
    startScrollTopRef.current = scrollRef.current?.scrollTop ?? 0
    lastClientXRef.current = event.clientX
    lastClientYRef.current = event.clientY
    event.currentTarget.setPointerCapture?.(event.pointerId)
    transition({
      type: 'pointer-down',
      mode: 'move',
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
      schedulePreview(lastClientXRef.current, lastClientYRef.current)
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
    schedulePreview(event.clientX, event.clientY)
    updateAutoScroll(event.clientX, event.clientY)
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

    if (!cancelled && current.phase === 'active') {
      event.preventDefault()
      event.stopPropagation()
      const finalPreview = calculatePreview(event.clientX, event.clientY)
        ?? preview
      if (
        finalPreview
        && (
          finalPreview.date !== date
          || finalPreview.startMinute !== startMinute
        )
      ) {
        onMove({
          appointmentId,
          expectedVersion,
          date: finalPreview.date,
          startMinute: finalPreview.startMinute,
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
    expectedVersion,
    onActiveChange,
    onMove,
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
    liveValue: preview ? previewLabel(preview, durationMinutes) : '',
    cardHandlers: {
      onPointerDown: begin,
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
