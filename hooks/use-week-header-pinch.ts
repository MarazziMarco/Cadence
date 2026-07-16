'use client'

import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from 'react'

import { clampVisibleWeekDays } from '@/lib/calendar/week-layout'

interface Point {
  x: number
  y: number
}

function distance(points: Point[]) {
  return Math.hypot(
    points[1].x - points[0].x,
    points[1].y - points[0].y,
  )
}

export function weekPinchStep({
  visibleDays,
  previousDistance,
  nextDistance,
}: {
  visibleDays: number
  previousDistance: number
  nextDistance: number
}) {
  if (previousDistance <= 0 || nextDistance <= 0) return visibleDays
  return clampVisibleWeekDays(
    visibleDays * previousDistance / nextDistance,
  )
}

export function useWeekHeaderPinch({
  visibleDays,
  onVisibleDaysChange,
  onPinchEnd,
}: {
  visibleDays: number
  onVisibleDaysChange(value: number): void
  onPinchEnd?(): void
}) {
  const pointers = useRef(new Map<number, Point>())
  const lastDistance = useRef<number | null>(null)
  const visibleDaysRef = useRef(visibleDays)

  useEffect(() => {
    visibleDaysRef.current = visibleDays
  }, [visibleDays])

  const end = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    pointers.current.delete(event.pointerId)
    if (pointers.current.size < 2) {
      lastDistance.current = null
      onPinchEnd?.()
    }
  }, [onPinchEnd])

  return {
    handlers: {
      onPointerDown(event: ReactPointerEvent<HTMLElement>) {
        if (event.pointerType === 'mouse') return
        pointers.current.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        })
        if (pointers.current.size === 2) {
          event.currentTarget.setPointerCapture?.(event.pointerId)
          lastDistance.current = distance(Array.from(pointers.current.values()))
        }
      },
      onPointerMove(event: ReactPointerEvent<HTMLElement>) {
        if (!pointers.current.has(event.pointerId)) return
        pointers.current.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        })
        if (pointers.current.size !== 2) return
        const nextDistance = distance(Array.from(pointers.current.values()))
        const previousDistance = lastDistance.current
        lastDistance.current = nextDistance
        if (!previousDistance) return
        event.preventDefault()
        const next = weekPinchStep({
          visibleDays: visibleDaysRef.current,
          previousDistance,
          nextDistance,
        })
        visibleDaysRef.current = next
        onVisibleDaysChange(next)
      },
      onPointerUp: end,
      onPointerCancel: end,
    },
  }
}
