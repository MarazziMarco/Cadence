'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'

import { zoomAroundFocalPoint } from '@/lib/calendar/geometry'

interface PinchZoomStepInput {
  density: number
  scale: number
  scrollTop: number
  focalY: number
  contentOffsetTop?: number
}

export function pinchZoomStep(input: PinchZoomStepInput) {
  return zoomAroundFocalPoint({
    oldDensity: input.density,
    newDensity: input.density * input.scale,
    scrollTop: input.scrollTop,
    focalY: input.focalY - (input.contentOffsetTop ?? 0),
  })
}

interface UsePinchZoomOptions {
  density: number
  disabled?: boolean
  contentOffsetTop?: number
  scrollRef: RefObject<HTMLElement | null>
  onDensityChange(density: number): void
}

interface PointerPosition {
  x: number
  y: number
}

function distance([first, second]: PointerPosition[]) {
  return Math.hypot(second.x - first.x, second.y - first.y)
}

export function pinchZoomIgnoresTarget(target: EventTarget | null) {
  return (
    target instanceof Element
    && target.closest('[data-pinch-zoom-ignore]') !== null
  )
}

export function usePinchZoom({
  density,
  disabled = false,
  contentOffsetTop = 0,
  scrollRef,
  onDensityChange,
}: UsePinchZoomOptions) {
  const [isPinching, setIsPinching] = useState(false)
  const pointersRef = useRef(new Map<number, PointerPosition>())
  const lastDistanceRef = useRef<number | null>(null)
  const densityRef = useRef(density)
  const scrollFrameRef = useRef<number | null>(null)

  useEffect(() => {
    densityRef.current = density
  }, [density])

  const reset = useCallback(() => {
    pointersRef.current.clear()
    lastDistanceRef.current = null
    setIsPinching(false)
  }, [])

  useEffect(() => {
    if (disabled) reset()
  }, [disabled, reset])

  useEffect(() => () => {
    if (scrollFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollFrameRef.current)
    }
  }, [])

  const updatePinch = useCallback((
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    if (disabled || event.pointerType === 'mouse') return
    const pointers = pointersRef.current
    if (!pointers.has(event.pointerId)) return
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.size !== 2) return

    const positions = Array.from(pointers.values())
    const nextDistance = distance(positions)
    const previousDistance = lastDistanceRef.current
    lastDistanceRef.current = nextDistance
    if (!previousDistance || previousDistance <= 0 || nextDistance <= 0) return

    event.preventDefault()
    const scrollContainer = scrollRef.current
    if (!scrollContainer) return
    const bounds = scrollContainer.getBoundingClientRect()
    const focalY = (
      (positions[0].y + positions[1].y) / 2
    ) - bounds.top
    const next = pinchZoomStep({
      density: densityRef.current,
      scale: nextDistance / previousDistance,
      scrollTop: scrollContainer.scrollTop,
      focalY,
      contentOffsetTop,
    })
    densityRef.current = next.density
    onDensityChange(next.density)
    if (scrollFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollFrameRef.current)
    }
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null
      scrollContainer.scrollTop = next.scrollTop
    })
  }, [contentOffsetTop, disabled, onDensityChange, scrollRef])

  const handlePointerDown = useCallback((
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    if (
      disabled
      || event.pointerType === 'mouse'
      || pinchZoomIgnoresTarget(event.target)
    ) return
    const pointers = pointersRef.current
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.size === 2) {
      event.currentTarget.setPointerCapture?.(event.pointerId)
      lastDistanceRef.current = distance(Array.from(pointers.values()))
      setIsPinching(true)
    } else if (pointers.size > 2) {
      lastDistanceRef.current = null
      setIsPinching(false)
    }
  }, [disabled])

  const handlePointerEnd = useCallback((
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    pointersRef.current.delete(event.pointerId)
    if (pointersRef.current.size < 2) {
      lastDistanceRef.current = null
      setIsPinching(false)
    }
  }, [])

  return {
    isPinching,
    handlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: updatePinch,
      onPointerUp: handlePointerEnd,
      onPointerCancel: handlePointerEnd,
    },
  }
}
