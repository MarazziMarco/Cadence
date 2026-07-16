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

const AUTO_SCROLL_EDGE_PX = 48
const AUTO_SCROLL_STEP_PX = 7

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function snap(value: number, interval: number) {
  return Math.round(value / interval) * interval
}

function autoScrollDirectionAt(
  scrollContainer: HTMLElement,
  bounds: DOMRect,
  clientX: number,
  clientY: number,
): AutoScrollDirection {
  const maxScrollLeft = Math.max(
    0,
    scrollContainer.scrollWidth - scrollContainer.clientWidth,
  )
  const maxScrollTop = Math.max(
    0,
    scrollContainer.scrollHeight - scrollContainer.clientHeight,
  )
  return {
    x: clientX < bounds.left + AUTO_SCROLL_EDGE_PX
      && scrollContainer.scrollLeft > 0
      ? -1
      : clientX > bounds.right - AUTO_SCROLL_EDGE_PX
        && scrollContainer.scrollLeft < maxScrollLeft
        ? 1
        : 0,
    y: clientY < bounds.top + AUTO_SCROLL_EDGE_PX
      && scrollContainer.scrollTop > 0
      ? -1
      : clientY > bounds.bottom - AUTO_SCROLL_EDGE_PX
        && scrollContainer.scrollTop < maxScrollTop
        ? 1
        : 0,
  }
}

function applyBoundedAutoScroll(
  scrollContainer: HTMLElement,
  direction: AutoScrollDirection,
) {
  const maxScrollLeft = Math.max(
    0,
    scrollContainer.scrollWidth - scrollContainer.clientWidth,
  )
  const maxScrollTop = Math.max(
    0,
    scrollContainer.scrollHeight - scrollContainer.clientHeight,
  )
  const nextLeft = clamp(
    scrollContainer.scrollLeft + direction.x * AUTO_SCROLL_STEP_PX,
    0,
    maxScrollLeft,
  )
  const nextTop = clamp(
    scrollContainer.scrollTop + direction.y * AUTO_SCROLL_STEP_PX,
    0,
    maxScrollTop,
  )
  const changed = (
    nextLeft !== scrollContainer.scrollLeft
    || nextTop !== scrollContainer.scrollTop
  )
  if (!changed) return false
  scrollContainer.scrollLeft = nextLeft
  scrollContainer.scrollTop = nextTop
  return true
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
  const activeReportedRef = useRef(false)
  const onActiveChangeRef = useRef(onActiveChange)

  useEffect(() => {
    onActiveChangeRef.current = onActiveChange
  }, [onActiveChange])

  const reportActive = useCallback((active: boolean) => {
    if (activeReportedRef.current === active) return
    activeReportedRef.current = active
    onActiveChangeRef.current?.(active)
  }, [])

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
    autoScrollFrameRef.current = null
    const scrollContainer = scrollRef.current
    if (!scrollContainer) return
    const bounds = scrollContainer.getBoundingClientRect()
    const direction = autoScrollDirectionAt(
      scrollContainer,
      bounds,
      lastClientXRef.current,
      lastClientYRef.current,
    )
    autoScrollDirectionRef.current = direction
    if (direction.x === 0 && direction.y === 0) return
    if (!applyBoundedAutoScroll(scrollContainer, direction)) {
      autoScrollDirectionRef.current = { x: 0, y: 0 }
      return
    }
    schedulePreview(lastClientXRef.current, lastClientYRef.current)
    const nextDirection = autoScrollDirectionAt(
      scrollContainer,
      bounds,
      lastClientXRef.current,
      lastClientYRef.current,
    )
    autoScrollDirectionRef.current = nextDirection
    if (nextDirection.x !== 0 || nextDirection.y !== 0) {
      autoScrollFrameRef.current = window.requestAnimationFrame(runAutoScroll)
    }
  }, [schedulePreview, scrollRef])

  const updateAutoScroll = useCallback((
    clientX: number,
    clientY: number,
  ) => {
    const scrollContainer = scrollRef.current
    if (!scrollContainer) return
    const bounds = scrollContainer.getBoundingClientRect()
    const direction = autoScrollDirectionAt(
      scrollContainer,
      bounds,
      clientX,
      clientY,
    )
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
      activationTimerRef.current = null
      const next = transition({
        type: 'activate',
        at: performance.now(),
      })
      if (next.phase !== 'active') return
      suppressClickRef.current = true
      reportActive(true)
      navigator.vibrate?.(15)
      schedulePreview(lastClientXRef.current, lastClientYRef.current)
    }, CALENDAR_LONG_PRESS_MS)
  }, [
    clearActivationTimer,
    disabled,
    reportActive,
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
    if (current.phase === 'active') reportActive(false)
    setPreview(null)
  }, [
    appointmentId,
    calculatePreview,
    clearActivationTimer,
    date,
    expectedVersion,
    onMove,
    preview,
    reportActive,
    startMinute,
    stopAutoScroll,
    transition,
  ])

  useEffect(() => () => {
    clearActivationTimer()
    stopAutoScroll()
    if (previewFrameRef.current !== null) {
      window.cancelAnimationFrame(previewFrameRef.current)
      previewFrameRef.current = null
    }
    reportActive(false)
  }, [clearActivationTimer, reportActive, stopAutoScroll])

  useEffect(() => {
    if (!disabled) return
    const wasActive = stateRef.current.phase === 'active'
    clearActivationTimer()
    stopAutoScroll()
    transition({ type: 'pointer-cancel' })
    setPreview(null)
    if (wasActive) reportActive(false)
  }, [
    clearActivationTimer,
    disabled,
    reportActive,
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
      onLostPointerCapture: (event: ReactPointerEvent<HTMLElement>) => finish(
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
